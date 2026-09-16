import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import { AppError, authenticate, errors, ok, parse, publish, requireInternal, TOPICS } from "@hustl/common"
import { prisma, Prisma } from "@hustl/db"
import {
  ensureConversationRequest,
  listConversationsQuery,
  listMessagesQuery,
  sendMessageRequest,
  type ConversationSummary,
  type EnsureConversationRequest,
  type EnsureConversationResponse,
  type MessageDTO,
} from "@hustl/contracts"
import { emitToConversation, pushUnread, unreadCounts } from "./realtime"

export const READ_ONLY_AFTER_DAYS = 30
const DAY_MS = 86_400_000
const uuid = z.string().uuid()

/** A conversation turns read-only 30 days after its deal was cancelled. */
export function isReadOnly(deal: { status: string; cancelledAt: Date | null; updatedAt: Date } | null, now = new Date()) {
  if (!deal || deal.status !== "CANCELLED") return false
  const at = deal.cancelledAt ?? deal.updatedAt
  return now.getTime() - at.getTime() > READ_ONLY_AFTER_DAYS * DAY_MS
}

type MessageRow = { id: string; conversationId: string; senderId: string; body: string; attachmentIds: string[]; createdAt: Date; editedAt: Date | null }
export const toMessageDTO = (m: MessageRow): MessageDTO => ({
  id: m.id,
  conversationId: m.conversationId,
  senderId: m.senderId,
  body: m.body,
  attachmentIds: m.attachmentIds,
  createdAt: m.createdAt.toISOString(),
  editedAt: m.editedAt?.toISOString() ?? null,
})

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"

/** Non-participants (and malformed ids) get 404 so a conversation's existence isn't leaked. */
async function requireParticipant(conversationId: string, userId: string) {
  if (!uuid.safeParse(conversationId).success) throw errors.notFound("Conversation")
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { lastReadAt: true },
  })
  if (!p) throw errors.notFound("Conversation")
  return p
}

// ─── Ensure (idempotent) ─────────────────────────────────────────────────────

async function addParticipants(conversationId: string, userIds: string[]) {
  await prisma.conversationParticipant.createMany({ data: [...new Set(userIds)].map((userId) => ({ conversationId, userId })), skipDuplicates: true })
}

/** Creates (or returns) the conversation for a deal or application; participants = brand user + creator user. */
export async function ensureConversation(input: EnsureConversationRequest): Promise<EnsureConversationResponse> {
  if (input.dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: input.dealId },
      select: { id: true, title: true, applicationId: true, brand: { select: { userId: true } }, creator: { select: { userId: true } } },
    })
    if (!deal) throw errors.notFound("Deal")
    const userIds = [deal.brand.userId, deal.creator.userId]

    const existing = await prisma.conversation.findUnique({ where: { dealId: deal.id }, select: { id: true } })
    if (existing) {
      await addParticipants(existing.id, userIds)
      return { id: existing.id, created: false }
    }

    // Keep one thread from shortlist to deal: adopt the application's conversation.
    if (deal.applicationId) {
      const fromApplication = await prisma.conversation.findUnique({ where: { applicationId: deal.applicationId }, select: { id: true } })
      if (fromApplication) {
        try {
          await prisma.conversation.updateMany({ where: { id: fromApplication.id, dealId: null }, data: { dealId: deal.id, subject: deal.title } })
        } catch (err) {
          if (!isUniqueViolation(err)) throw err
        }
        const linked = await prisma.conversation.findUnique({ where: { dealId: deal.id }, select: { id: true } })
        if (linked) {
          await addParticipants(linked.id, userIds)
          return { id: linked.id, created: false }
        }
      }
    }

    try {
      const created = await prisma.conversation.create({
        data: { dealId: deal.id, subject: deal.title, participants: { createMany: { data: [...new Set(userIds)].map((userId) => ({ userId })) } } },
        select: { id: true },
      })
      return { id: created.id, created: true }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const winner = await prisma.conversation.findUniqueOrThrow({ where: { dealId: deal.id }, select: { id: true } })
      await addParticipants(winner.id, userIds)
      return { id: winner.id, created: false }
    }
  }

  const application = await prisma.application.findUnique({
    where: { id: input.applicationId! },
    select: {
      id: true,
      brief: { select: { title: true, brand: { select: { userId: true } } } },
      creator: { select: { userId: true } },
      deal: { select: { conversation: { select: { id: true } } } },
    },
  })
  if (!application) throw errors.notFound("Application")
  const userIds = [application.brief.brand.userId, application.creator.userId]

  const existing =
    (await prisma.conversation.findUnique({ where: { applicationId: application.id }, select: { id: true } })) ?? application.deal?.conversation ?? null
  if (existing) {
    await addParticipants(existing.id, userIds)
    return { id: existing.id, created: false }
  }
  try {
    const created = await prisma.conversation.create({
      data: {
        applicationId: application.id,
        subject: application.brief.title,
        participants: { createMany: { data: [...new Set(userIds)].map((userId) => ({ userId })) } },
      },
      select: { id: true },
    })
    return { id: created.id, created: true }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const winner = await prisma.conversation.findUniqueOrThrow({ where: { applicationId: application.id }, select: { id: true } })
    await addParticipants(winner.id, userIds)
    return { id: winner.id, created: false }
  }
}

// ─── Summaries ───────────────────────────────────────────────────────────────

const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url")
function decodeCursor(cursor: string) {
  const [at, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|")
  const date = new Date(at ?? "")
  if (!id || Number.isNaN(date.getTime()) || !uuid.safeParse(id).success) throw errors.validation("Invalid cursor", { cursor: ["Malformed cursor"] })
  return { at: date, id }
}

async function buildSummaries(userId: string, ids: string[]): Promise<ConversationSummary[]> {
  if (ids.length === 0) return []
  const [conversations, lastIds, unread] = await Promise.all([
    prisma.conversation.findMany({
      where: { id: { in: ids } },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, image: true, role: true, brand: { select: { companyName: true, logoUrl: true } }, creator: { select: { handle: true, avatarUrl: true } } } },
          },
        },
        deal: { select: { id: true, title: true, status: true, cancelledAt: true, updatedAt: true } },
        application: { select: { id: true, briefId: true, status: true, brief: { select: { title: true } } } },
      },
    }),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (conversation_id) id::text AS id FROM messages
      WHERE conversation_id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
      ORDER BY conversation_id, created_at DESC, id DESC`,
    prisma.$queryRaw<{ conversation_id: string; count: bigint }[]>`
      SELECT m.conversation_id::text AS conversation_id, count(*)::bigint AS count FROM messages m
      JOIN conversation_participants p ON p.conversation_id = m.conversation_id AND p.user_id = ${userId}::uuid
      WHERE m.conversation_id = ANY(${ids}::uuid[]) AND m.sender_id <> ${userId}::uuid AND m.deleted_at IS NULL
        AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
      GROUP BY m.conversation_id`,
  ])
  const lastMessages = lastIds.length ? await prisma.message.findMany({ where: { id: { in: lastIds.map((r) => r.id) } } }) : []
  const lastByConversation = new Map(lastMessages.map((m) => [m.conversationId, m]))
  const unreadByConversation = new Map(unread.map((r) => [r.conversation_id, Number(r.count)]))
  const byId = new Map(conversations.map((c) => [c.id, c]))

  return ids.flatMap((id) => {
    const c = byId.get(id)
    if (!c) return []
    const me = c.participants.find((p) => p.userId === userId)
    const other = c.participants.find((p) => p.userId !== userId)?.user
    const last = lastByConversation.get(c.id)
    const summary: ConversationSummary = {
      id: c.id,
      subject: c.subject,
      counterpart: other
        ? {
            userId: other.id,
            role: other.role,
            name: other.brand?.companyName ?? other.name,
            avatarUrl: other.brand ? other.brand.logoUrl : (other.creator?.avatarUrl ?? other.image),
            handle: other.creator?.handle ?? null,
          }
        : null,
      deal: c.deal ? { id: c.deal.id, title: c.deal.title, status: c.deal.status } : null,
      application: c.application ? { id: c.application.id, briefId: c.application.briefId, title: c.application.brief.title, status: c.application.status } : null,
      lastMessage: last ? toMessageDTO(last) : null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unreadCount: unreadByConversation.get(c.id) ?? 0,
      lastReadAt: me?.lastReadAt?.toISOString() ?? null,
      readOnly: isReadOnly(c.deal),
      createdAt: c.createdAt.toISOString(),
    }
    return [summary]
  })
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const uid = (req: FastifyRequest) => req.user!.id
const idParam = (req: FastifyRequest) => (req.params as { id: string }).id

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/conversations", { preHandler: authenticate }, async (req) => {
    const q = parse(listConversationsQuery, req.query)
    const cursor = q.cursor ? decodeCursor(q.cursor) : null
    const cursorSql = cursor
      ? Prisma.sql`AND (COALESCE(c.last_message_at, c.created_at), c.id) < (${cursor.at.toISOString()}::timestamp, ${cursor.id}::uuid)`
      : Prisma.empty
    const dealSql = q.dealId ? Prisma.sql`AND c.deal_id = ${q.dealId}::uuid` : Prisma.empty
    const rows = await prisma.$queryRaw<{ id: string; sort_at: Date }[]>`
      SELECT c.id::text AS id, COALESCE(c.last_message_at, c.created_at) AS sort_at
      FROM conversations c
      JOIN conversation_participants p ON p.conversation_id = c.id AND p.user_id = ${uid(req)}::uuid
      WHERE TRUE ${cursorSql} ${dealSql}
      ORDER BY sort_at DESC, c.id DESC
      LIMIT ${q.limit + 1}`
    const page = rows.slice(0, q.limit)
    const nextCursor = rows.length > q.limit ? encodeCursor(page[page.length - 1]!.sort_at, page[page.length - 1]!.id) : null
    return ok(await buildSummaries(uid(req), page.map((r) => r.id)), { nextCursor })
  })

  app.get("/conversations/unread-count", { preHandler: authenticate }, async (req) => {
    const counts = await unreadCounts(uid(req))
    return ok({ count: counts.messages })
  })

  app.get("/conversations/:id", { preHandler: authenticate }, async (req) => {
    await requireParticipant(idParam(req), uid(req))
    const [summary] = await buildSummaries(uid(req), [idParam(req)])
    if (!summary) throw errors.notFound("Conversation")
    return ok(summary)
  })

  app.get("/conversations/:id/messages", { preHandler: authenticate }, async (req) => {
    const conversationId = idParam(req)
    await requireParticipant(conversationId, uid(req))
    const q = parse(listMessagesQuery, req.query)
    let olderThan: Prisma.MessageWhereInput = {}
    if (q.before) {
      const anchor = await prisma.message.findFirst({ where: { id: q.before, conversationId }, select: { id: true, createdAt: true } })
      if (!anchor) throw errors.notFound("Message")
      olderThan = { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }
    }
    const rows = await prisma.message.findMany({
      where: { conversationId, deletedAt: null, ...olderThan },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
    })
    const page = rows.slice(0, q.limit)
    return ok(page.map(toMessageDTO), { nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null })
  })

  app.post("/conversations/:id/messages", { preHandler: authenticate }, async (req, reply) => {
    const conversationId = idParam(req)
    const senderId = uid(req)
    await requireParticipant(conversationId, senderId)
    const input = parse(sendMessageRequest, req.body)
    const attachmentIds = [...new Set(input.attachmentIds ?? [])]

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { id: true, dealId: true, applicationId: true, deal: { select: { status: true, cancelledAt: true, updatedAt: true } }, participants: { select: { userId: true } } },
    })
    if (isReadOnly(conversation.deal)) throw new AppError("FORBIDDEN", "This conversation is read-only because the deal was cancelled more than 30 days ago")

    if (attachmentIds.length) {
      const owned = await prisma.mediaAsset.findMany({ where: { id: { in: attachmentIds }, ownerId: senderId, status: "READY" }, select: { id: true } })
      const ownedIds = new Set(owned.map((a) => a.id))
      const invalid = attachmentIds.filter((id) => !ownedIds.has(id))
      if (invalid.length) throw errors.validation("Invalid attachments", { fieldErrors: { attachmentIds: [`Unknown or unavailable media assets: ${invalid.join(", ")}`] } })
    }

    const participantIds = conversation.participants.map((p) => p.userId)
    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { conversationId, senderId, body: input.body, attachmentIds } })
      await tx.conversation.updateMany({
        where: { id: conversationId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: m.createdAt } }] },
        data: { lastMessageAt: m.createdAt },
      })
      await tx.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: senderId } }, data: { lastReadAt: m.createdAt } })
      await publish(tx, TOPICS.MESSAGE_SENT, conversationId, {
        messageId: m.id,
        conversationId,
        senderId,
        recipientIds: participantIds.filter((id) => id !== senderId),
        dealId: conversation.dealId,
        applicationId: conversation.applicationId,
        createdAt: m.createdAt.toISOString(),
      })
      return m
    })

    const dto = toMessageDTO(message)
    emitToConversation(conversationId, participantIds, "message:new", { conversationId, message: dto })
    return reply.status(201).send(ok(dto))
  })

  app.post("/conversations/:id/read", { preHandler: authenticate }, async (req) => {
    const conversationId = idParam(req)
    const userId = uid(req)
    await requireParticipant(conversationId, userId)
    const lastReadAt = new Date()
    await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt } })
    const participants = await prisma.conversationParticipant.findMany({ where: { conversationId }, select: { userId: true } })
    emitToConversation(
      conversationId,
      participants.map((p) => p.userId),
      "message:read",
      { conversationId, userId, lastReadAt: lastReadAt.toISOString() },
    )
    await pushUnread([userId])
    return ok({ conversationId, lastReadAt: lastReadAt.toISOString(), unreadCount: 0 })
  })

  app.post("/internal/conversations/ensure", { preHandler: requireInternal }, async (req, reply) => {
    const input = parse(ensureConversationRequest, req.body)
    const result = await ensureConversation(input)
    return reply.status(result.created ? 201 : 200).send(ok(result))
  })
}
