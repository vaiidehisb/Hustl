"use client"
// Socket.io client for notification-service (through the gateway).
// The access token is fetched from a session-bound same-origin route on every
// (re)connect, so reconnects pick up refreshed tokens.
import { io, type Socket } from "socket.io-client"
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from "@hustl/contracts"

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export const realtimeUrl = () => process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:4000"

let socket: RealtimeSocket | null = null
let refs = 0

async function fetchRealtimeToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/realtime-token", { cache: "no-store", credentials: "same-origin" })
    if (!res.ok) return null
    const body = (await res.json()) as { success: boolean; data?: { token: string } }
    return body.success ? (body.data?.token ?? null) : null
  } catch {
    return null
  }
}

/** Ref-counted shared socket. Call `releaseSocket()` when the consumer unmounts. */
export function acquireSocket(): RealtimeSocket {
  if (!socket) {
    socket = io(realtimeUrl(), {
      path: SOCKET_PATH,
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 15_000,
      auth: (cb) => {
        void fetchRealtimeToken().then((token) => cb({ token }))
      },
    })
  }
  refs++
  if (!socket.connected && !socket.active) socket.connect()
  return socket
}

export function releaseSocket() {
  refs = Math.max(0, refs - 1)
  if (refs === 0 && socket) {
    socket.disconnect()
    socket.removeAllListeners()
    socket = null
  }
}

export const getSocket = () => socket
