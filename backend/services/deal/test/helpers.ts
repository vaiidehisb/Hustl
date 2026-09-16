import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { signAccessToken, type EventEnvelope, type Topic } from "@hustl/common"
import { prisma, type BrandPlan, type KycStatus } from "@hustl/db"

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12)

export async function makeBrand(opts: { name?: string; plan?: BrandPlan; kycStatus?: KycStatus; ageDays?: number } = {}) {
  const id = uid()
  const user = await prisma.user.create({
    data: {
      email: `brand_${id}@test.hustl.dev`,
      name: opts.name ?? `Brand Owner ${id}`,
      role: "BRAND",
      kycStatus: opts.kycStatus ?? "NONE",
      createdAt: new Date(Date.now() - (opts.ageDays ?? 30) * 86_400_000),
      brand: { create: { slug: `brand-${id}`, companyName: `Acme ${id}`, plan: opts.plan ?? "STARTER" } },
    },
    include: { brand: true },
  })
  return { user, brand: user.brand!, token: signAccessToken({ id: user.id, email: user.email, role: "BRAND" }) }
}

export async function makeCreator(opts: { name?: string; reliability?: number } = {}) {
  const id = uid()
  const user = await prisma.user.create({
    data: {
      email: `creator_${id}@test.hustl.dev`,
      name: opts.name ?? `Creator ${id}`,
      role: "CREATOR",
      creator: { create: { handle: `creator_${id}`, niches: ["tech"] } },
    },
    include: { creator: true },
  })
  if (opts.reliability !== undefined)
    await prisma.creatorScore.create({ data: { creatorId: user.creator!.id, trustScore: 80, nicheAuthority: 70, reliabilityScore: opts.reliability, modelVersion: "test" } })
  return { user, creator: user.creator!, token: signAccessToken({ id: user.id, email: user.email, role: "CREATOR" }) }
}

export async function makeAdmin() {
  const id = uid()
  const user = await prisma.user.create({ data: { email: `admin_${id}@test.hustl.dev`, name: `Admin ${id}`, role: "ADMIN" } })
  return { user, token: signAccessToken({ id: user.id, email: user.email, role: "ADMIN" }) }
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
export const internal = () => ({ "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN! })

export async function outbox(key: string, topic: Topic) {
  const rows = await prisma.outboxEvent.findMany({ where: { key, topic }, orderBy: { id: "asc" } })
  return rows.map((e): EventEnvelope => ({ id: String(e.id), topic: e.topic as Topic, key: e.key, payload: e.payload as Record<string, unknown>, createdAt: e.createdAt.toISOString() }))
}

type StubHandler = (body: Record<string, unknown>, path: string) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }>

/** Local stand-in for the FastAPI AI backend. */
export async function startAiStub(routes: Record<string, StubHandler>) {
  const calls: { path: string; body: Record<string, unknown>; token: string | undefined }[] = []
  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let raw = ""
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : {}
    const path = (req.url ?? "").split("?")[0]
    calls.push({ path, body, token: req.headers["x-internal-token"] as string | undefined })
    const key = Object.keys(routes).find((k) => (k.endsWith("*") ? path.startsWith(k.slice(0, -1)) : path === k))
    const out = key ? await routes[key](body, path) : { status: 404, json: { detail: "not found" } }
    res.writeHead(out.status ?? 200, { "content-type": "application/json" })
    res.end(JSON.stringify(out.json))
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { url, calls, close: () => new Promise<void>((r) => server.close(() => r())) }
}

/** A URL nothing listens on (for outage simulation). */
export async function deadUrl() {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((r) => server.close(() => r()))
  return `http://127.0.0.1:${port}`
}
