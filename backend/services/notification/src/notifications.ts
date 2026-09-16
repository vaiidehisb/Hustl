import type { FastifyInstance, FastifyRequest } from "fastify"
import { authenticate, errors, ok, parse } from "@hustl/common"
import { prisma, Prisma, type Notification } from "@hustl/db"
import { listNotificationsQuery, markNotificationsReadRequest, type NotificationDTO } from "@hustl/contracts"
import { emitToUsers, pushUnread } from "./realtime"
import { sendEmail } from "./email"

export const toNotificationDTO = (n: Notification): NotificationDTO => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  href: n.href,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
})

export type NotificationInput = { userId: string; title: string; body: string; href: string | null; email?: boolean }

/**
 * Persist notifications for one event. Idempotent on (user_id, event_id): a
 * replayed event creates nothing and sends no push or email. Returns only the
 * rows created by this call.
 */
export async function deliverNotifications(eventId: string, type: string, items: NotificationInput[]): Promise<Notification[]> {
  const byUser = new Map<string, NotificationInput>()
  for (const item of items) if (!byUser.has(item.userId)) byUser.set(item.userId, item)
  if (byUser.size === 0) return []

  // Only users that still exist (avoids FK failures for deleted accounts).
  const existing = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true } })
  const data = existing.map(({ id }) => {
    const item = byUser.get(id)!
    return { userId: id, eventId, type, title: item.title, body: item.body, href: item.href }
  })
  let rows: Notification[]
  try {
    // ON CONFLICT (user_id, event_id) DO NOTHING: a replayed event returns no rows.
    rows = await prisma.notification.createManyAndReturn({ data, skipDuplicates: true })
  } catch (err) {
    // A user deleted between the lookup and the insert: fall back to per-row inserts.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003")) throw err
    rows = []
    for (const d of data) {
      const r = await prisma.notification.createManyAndReturn({ data: [d], skipDuplicates: true }).catch(() => [])
      rows.push(...r)
    }
  }
  const created = rows.map((row) => ({ row, email: !!byUser.get(row.userId)?.email }))

  for (const { row } of created) emitToUsers([row.userId], "notification:new", toNotificationDTO(row))
  await pushUnread(created.map((c) => c.row.userId))

  const emailed = created.filter((c) => c.email)
  if (emailed.length) {
    const users = await prisma.user.findMany({ where: { id: { in: emailed.map((c) => c.row.userId) }, deletedAt: null, status: "ACTIVE" }, select: { id: true, email: true } })
    const emailById = new Map(users.map((u) => [u.id, u.email]))
    for (const { row } of emailed) {
      const to = emailById.get(row.userId)
      // Fire-and-forget: sendEmail never rejects, and email must never hold up in-app delivery.
      if (to) void sendEmail(to, { title: row.title, body: row.body, href: row.href })
    }
  }
  return created.map((c) => c.row)
}

const uid = (req: FastifyRequest) => req.user!.id

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/notifications", { preHandler: authenticate }, async (req) => {
    const q = parse(listNotificationsQuery, req.query)
    const where: Prisma.NotificationWhereInput = { userId: uid(req), ...(q.unread && { readAt: null }) }
    if (q.cursor) {
      const anchor = await prisma.notification.findFirst({ where: { id: q.cursor, userId: uid(req) }, select: { id: true, createdAt: true } })
      if (!anchor) throw errors.validation("Invalid cursor", { fieldErrors: { cursor: ["Unknown cursor"] } })
      where.OR = [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }]
    }
    const rows = await prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.limit + 1 })
    const page = rows.slice(0, q.limit)
    return ok(page.map(toNotificationDTO), { nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null })
  })

  app.get("/notifications/unread-count", { preHandler: authenticate }, async (req) => {
    return ok({ count: await prisma.notification.count({ where: { userId: uid(req), readAt: null } }) })
  })

  app.post("/notifications/read", { preHandler: authenticate }, async (req) => {
    const input = parse(markNotificationsReadRequest, req.body ?? {})
    const userId = uid(req)
    const { count } = await prisma.notification.updateMany({
      where: { userId, readAt: null, ...(input.ids && { id: { in: input.ids } }) },
      data: { readAt: new Date() },
    })
    await pushUnread([userId])
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } })
    return ok({ updated: count, unreadCount })
  })
}
