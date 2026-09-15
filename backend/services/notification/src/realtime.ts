// Socket.io real-time channel attached to the Fastify HTTP server.
// Rooms: `user:<id>` (joined on connect), `conversation:<id>` (joined on request,
// participants only). Redis adapter when REDIS_URL is set so any instance can emit.

import type { Server as HttpServer } from "node:http"
import { Server, type Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { Redis } from "ioredis"
import { AppError, verifyAccessToken, type AuthUser } from "@hustl/common"
import type { ClientToServerEvents, ServerToClientEvents, SocketAck, SocketErrorPayload, UnreadCounts } from "@hustl/contracts"
import { prisma } from "@hustl/db"

type SocketData = { user: AuthUser }
export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

export const userRoom = (id: string) => `user:${id}`
export const conversationRoom = (id: string) => `conversation:${id}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let io: IO | undefined
let adapterKind: "redis" | "in-memory" = "in-memory"
let redisClients: Redis[] = []

/** Resolve the user from a handshake: `auth.token` or `Authorization: Bearer`. Throws AppError(UNAUTHORIZED). */
export function authenticateHandshake(handshake: { auth?: Record<string, unknown>; headers?: Record<string, string | string[] | undefined> }): AuthUser {
  const fromAuth = typeof handshake.auth?.token === "string" ? handshake.auth.token.replace(/^Bearer\s+/i, "") : undefined
  const header = handshake.headers?.authorization
  const fromHeader = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined
  const token = fromAuth || fromHeader
  if (!token) throw new AppError("UNAUTHORIZED", "Authentication required")
  return verifyAccessToken(token)
}

/** Participant check used by `conversation:join`. Returns an error payload or null when allowed. */
export async function authorizeConversationJoin(userId: string, conversationId: unknown): Promise<SocketErrorPayload | null> {
  if (typeof conversationId !== "string" || !UUID.test(conversationId))
    return { code: "VALIDATION_ERROR", message: "conversationId must be a UUID", event: "conversation:join" }
  const p = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } }, select: { userId: true } })
  return p ? null : { code: "NOT_FOUND", message: "Conversation not found", event: "conversation:join" }
}

export async function unreadCounts(userId: string): Promise<UnreadCounts> {
  const [rows, notifications] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM messages m
      JOIN conversation_participants p ON p.conversation_id = m.conversation_id AND p.user_id = ${userId}::uuid
      WHERE m.sender_id <> ${userId}::uuid AND m.deleted_at IS NULL
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)`,
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])
  return { messages: Number(rows[0]?.count ?? 0), notifications }
}

function handleConnection(socket: AppSocket) {
  const user = socket.data.user
  socket.join(userRoom(user.id))

  socket.on("conversation:join", async (payload, ack) => {
    const conversationId = payload?.conversationId
    let res: SocketAck
    try {
      const error = await authorizeConversationJoin(user.id, conversationId)
      if (error) {
        socket.emit("error", error)
        res = { ok: false, error }
      } else {
        await socket.join(conversationRoom(conversationId))
        res = { ok: true }
      }
    } catch {
      const error: SocketErrorPayload = { code: "FORBIDDEN", message: "Could not join conversation", event: "conversation:join" }
      socket.emit("error", error)
      res = { ok: false, error }
    }
    if (typeof ack === "function") ack(res)
  })

  socket.on("conversation:leave", async (payload, ack) => {
    if (typeof payload?.conversationId === "string") await socket.leave(conversationRoom(payload.conversationId))
    if (typeof ack === "function") ack({ ok: true })
  })

  socket.on("typing", (payload) => {
    const conversationId = payload?.conversationId
    if (typeof conversationId !== "string") return
    const room = conversationRoom(conversationId)
    // Only sockets that passed the participant check are in the room.
    if (!socket.rooms.has(room)) {
      socket.emit("error", { code: "FORBIDDEN", message: "Join the conversation before sending typing events", event: "typing" })
      return
    }
    socket.to(room).emit("typing", { conversationId, userId: user.id, isTyping: payload.isTyping !== false })
  })
}

export function attachRealtime(server: HttpServer, opts: { corsOrigins?: string[] } = {}): IO {
  const instance: IO = new Server(server, {
    path: "/socket.io",
    cors: { origin: opts.corsOrigins ?? (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","), credentials: true },
    serveClient: false,
  })

  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    const pub = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: null })
    const sub = pub.duplicate()
    redisClients = [pub, sub]
    instance.adapter(createAdapter(pub, sub))
    adapterKind = "redis"
  } else {
    adapterKind = "in-memory"
  }

  instance.use((socket, next) => {
    try {
      socket.data.user = authenticateHandshake(socket.handshake)
      next()
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Invalid access token"
      next(Object.assign(new Error(message), { data: { code: "UNAUTHORIZED" } }))
    }
  })
  instance.on("connection", handleConnection)
  io = instance
  return instance
}

export async function closeRealtime() {
  if (!io) return
  io.disconnectSockets(true)
  io.engine.close()
  io = undefined
  await Promise.all(redisClients.map((c) => c.quit().catch(() => undefined)))
  redisClients = []
}

export async function realtimeHealth(): Promise<string> {
  if (adapterKind === "redis") {
    const pong = await redisClients[0]?.ping()
    return pong === "PONG" ? "redis" : "redis: down"
  }
  return io ? "in-memory" : "not attached"
}

// ─── Emit helpers (no-ops when the socket server isn't attached, e.g. in unit tests) ──

export function emitToUsers<E extends keyof ServerToClientEvents>(userIds: string[], event: E, ...args: Parameters<ServerToClientEvents[E]>) {
  if (!io || userIds.length === 0) return
  io.to(userIds.map(userRoom)).emit(event, ...args)
}

/** Emits once per socket even when it is in both the conversation room and a participant's user room. */
export function emitToConversation<E extends keyof ServerToClientEvents>(conversationId: string, participantIds: string[], event: E, ...args: Parameters<ServerToClientEvents[E]>) {
  if (!io) return
  io.to([conversationRoom(conversationId), ...participantIds.map(userRoom)]).emit(event, ...args)
}

export async function pushUnread(userIds: string[]) {
  if (!io) return
  await Promise.all(userIds.map(async (id) => emitToUsers([id], "unread:update", await unreadCounts(id))))
}
