import "./setup"
import { randomUUID } from "node:crypto"
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { prisma } from "@hustl/db"
import { signAccessToken, TOPICS } from "@hustl/common"
import { buildApp } from "../src/app"
import { signFile, verifyFileSignature } from "../src/signing"

let app: FastifyInstance
const tag = `md${randomUUID().slice(0, 8)}`
const userIds: string[] = []
const dealIds: string[] = []
const tokens: Record<string, string> = {}
const ids: Record<string, string> = {}
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") // 16 bytes

async function user(key: string, role: "BRAND" | "CREATOR" | "ADMIN") {
  const u = await prisma.user.create({ data: { email: `${tag}-${key}@test.hustl.local`, name: `${tag} ${key}`, role } })
  userIds.push(u.id)
  ids[`user_${key}`] = u.id
  tokens[key] = signAccessToken({ id: u.id, email: u.email, role })
  return u
}

const auth = (key: string) => ({ authorization: `Bearer ${tokens[key]}` })

beforeAll(async () => {
  app = await buildApp()
  const brandUser = await user("brand", "BRAND")
  const creatorUser = await user("creator", "CREATOR")
  const outsiderUser = await user("outsider", "CREATOR")
  await user("admin", "ADMIN")
  const brand = await prisma.brandProfile.create({ data: { userId: brandUser.id, slug: `${tag}-b`, companyName: `${tag} Brand` } })
  const creator = await prisma.creatorProfile.create({
    data: {
      userId: creatorUser.id,
      handle: `${tag}_creator`,
      headline: "Fitness creator",
      niches: ["fitness"],
      followersTotal: 12000,
      engagementRate: 0.041,
      rateCard: [{ deliverable: "Instagram reel", price: 15000 }],
      socialAccounts: {
        create: [
          { platform: "INSTAGRAM", source: "SELF_REPORTED", status: "CONNECTED", handle: "fit", followers: 12000, engagementRate: 0.041 },
        ],
      },
      score: { create: { trustScore: 70, nicheAuthority: 60, reliabilityScore: 80, modelVersion: "t" } },
    },
  })
  await prisma.creatorProfile.create({ data: { userId: outsiderUser.id, handle: `${tag}_out` } })
  ids.creator = creator.id
  const base = { brandId: brand.id, creatorId: creator.id, amount: 20000, paymentMode: "MILESTONES" as const, brandFeeRate: 0.08, creatorFeeRate: 0.05, processingFeeRate: 0.02 }
  const signed = await prisma.deal.create({ data: { ...base, title: "Signed deal", status: "IN_PROGRESS" } })
  const unsigned = await prisma.deal.create({ data: { ...base, title: "Unsigned deal", status: "AGREED" } })
  dealIds.push(signed.id, unsigned.id)
  ids.signed = signed.id
  ids.unsigned = unsigned.id
  const terms = { clauses: [{ title: "Deliverables", body: "One Instagram reel." }, { title: "Payment", body: "INR 20,000 on approval." }] }
  await prisma.contract.create({
    data: { dealId: signed.id, terms, bodyHash: "a".repeat(64), brandSignedAt: new Date(), brandSignerName: "Brand Signer", creatorSignedAt: new Date(), creatorSignerName: "Creator Signer" },
  })
  await prisma.contract.create({ data: { dealId: unsigned.id, terms, bodyHash: "b".repeat(64), brandSignedAt: new Date(), brandSignerName: "Brand Signer" } })
  await prisma.milestone.create({ data: { dealId: signed.id, position: 1, title: "Reel", percent: 100, amount: 20000, status: "SUBMITTED" } })
  await prisma.ledgerEntry.create({ data: { dealId: signed.id, type: "ESCROW_FUND", amount: 20000, provider: "TEST" } })
})

afterAll(async () => {
  const assets = await prisma.mediaAsset.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } })
  await prisma.outboxEvent.deleteMany({ where: { topic: TOPICS.MEDIA_READY, key: { in: assets.map((a) => a.id) } } })
  await prisma.ledgerEntry.deleteMany({ where: { dealId: { in: dealIds } } })
  await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: userIds } } })
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  await app.close()
  await prisma.$disconnect()
  rmSync(process.env.STORAGE_LOCAL_DIR!, { recursive: true, force: true })
})

const createUpload = (who: string, body: Record<string, unknown>) => app.inject({ method: "POST", url: "/media/uploads", headers: auth(who), payload: body })

describe("upload policy", () => {
  it("rejects disallowed types, oversize files, generated kinds and missing deals", async () => {
    expect((await app.inject({ method: "POST", url: "/media/uploads", payload: {} })).statusCode).toBe(401)
    const cases = [
      { kind: "AVATAR", fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 100 },
      { kind: "AVATAR", fileName: "a.png", mimeType: "image/png", sizeBytes: 5 * 1024 * 1024 + 1 },
      { kind: "DELIVERABLE", fileName: "a.exe", mimeType: "application/x-msdownload", sizeBytes: 100, dealId: ids.signed },
      { kind: "DELIVERABLE", fileName: "v.mp4", mimeType: "video/mp4", sizeBytes: 500 * 1024 * 1024 + 1, dealId: ids.signed },
      { kind: "DELIVERABLE", fileName: "v.mp4", mimeType: "video/mp4", sizeBytes: 100 },
      { kind: "CONTRACT_PDF", fileName: "c.pdf", mimeType: "application/pdf", sizeBytes: 100, dealId: ids.signed },
      { kind: "AVATAR", fileName: "../etc/passwd", mimeType: "image/png", sizeBytes: 10 },
    ]
    for (const c of cases) {
      const res = await createUpload("creator", c)
      expect(res.statusCode, JSON.stringify(c)).toBe(422)
    }
    const outsider = await createUpload("outsider", { kind: "DELIVERABLE", fileName: "v.mp4", mimeType: "video/mp4", sizeBytes: 100, dealId: ids.signed })
    expect(outsider.statusCode).toBe(403)
  })

  it("returns 503 when STORAGE_DRIVER=s3 is missing configuration", async () => {
    process.env.STORAGE_DRIVER = "s3"
    try {
      const res = await createUpload("creator", { kind: "AVATAR", fileName: "a.png", mimeType: "image/png", sizeBytes: 16 })
      expect(res.statusCode).toBe(503)
      expect(res.json().error).toMatchObject({ code: "INTEGRATION_UNAVAILABLE", details: { missingEnv: ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] } })
    } finally {
      process.env.STORAGE_DRIVER = "local"
    }
  })
})

describe("local storage flow", () => {
  it("uploads, completes, signs downloads and deletes", async () => {
    const created = await createUpload("creator", { kind: "AVATAR", fileName: "me.png", mimeType: "image/png", sizeBytes: PNG.length })
    expect(created.statusCode).toBe(201)
    const { asset, upload } = created.json().data
    expect(upload).toMatchObject({ method: "PUT", url: `/media/uploads/${asset.id}/content`, driver: "local" })
    expect(asset.status).toBe("PENDING_UPLOAD")

    const put = (who: string, body: Buffer, type = "image/png") =>
      app.inject({ method: "PUT", url: upload.url, headers: { ...auth(who), "content-type": type }, payload: body })
    expect((await put("outsider", PNG)).statusCode).toBe(403)
    expect((await put("creator", PNG, "image/jpeg")).statusCode).toBe(422)
    expect((await put("creator", Buffer.concat([PNG, PNG]))).statusCode).toBe(422)
    // Nothing was written, so completion fails.
    expect((await app.inject({ method: "POST", url: `/media/uploads/${asset.id}/complete`, headers: auth("creator") })).statusCode).toBe(409)

    const ok = await put("creator", PNG)
    expect(ok.statusCode).toBe(200)
    expect(ok.json().data.receivedBytes).toBe(16)

    const complete = await app.inject({ method: "POST", url: `/media/uploads/${asset.id}/complete`, headers: auth("creator") })
    expect(complete.statusCode).toBe(200)
    expect(complete.json().data).toMatchObject({ status: "READY", sizeBytes: 16 })
    expect(await prisma.outboxEvent.count({ where: { topic: TOPICS.MEDIA_READY, key: asset.id } })).toBe(1)

    // Any signed-in user may view an avatar.
    const meta = await app.inject({ method: "GET", url: `/media/${asset.id}`, headers: auth("brand") })
    expect(meta.statusCode).toBe(200)
    const { url } = meta.json().data.download
    const file = await app.inject({ method: "GET", url })
    expect(file.statusCode).toBe(200)
    expect(file.headers["content-type"]).toBe("image/png")
    expect(file.rawPayload.equals(PNG)).toBe(true)

    const tampered = url.replace(/sig=([^&]+)/, (_m: string, s: string) => `sig=${s.slice(0, -2)}${s.endsWith("AA") ? "BB" : "AA"}`)
    expect((await app.inject({ method: "GET", url: tampered })).statusCode).toBe(403)
    const otherAsset = url.replace(asset.id, randomUUID())
    expect((await app.inject({ method: "GET", url: otherAsset })).statusCode).toBe(403)
    const past = Math.floor(Date.now() / 1000) - 1
    const expired = await app.inject({ method: "GET", url: `/media/files/${asset.id}?exp=${past}&sig=${signFile(asset.id, past)}` })
    expect(expired.statusCode).toBe(403)
    expect(expired.json().error.message).toMatch(/expired/)

    expect((await app.inject({ method: "DELETE", url: `/media/${asset.id}`, headers: auth("brand") })).statusCode).toBe(403)
    const stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })
    const diskPath = path.join(process.env.STORAGE_LOCAL_DIR!, stored.storageKey)
    expect(existsSync(diskPath)).toBe(true)
    expect((await app.inject({ method: "DELETE", url: `/media/${asset.id}`, headers: auth("creator") })).statusCode).toBe(200)
    expect(existsSync(diskPath)).toBe(false)
  })

  it("verifies signatures with expiry", () => {
    const now = 1_800_000_000
    const sig = signFile("x", now + 60)
    expect(verifyFileSignature("x", now + 60, sig, now)).toBe("ok")
    expect(verifyFileSignature("x", now + 60, sig, now + 61)).toBe("expired")
    expect(verifyFileSignature("y", now + 60, sig, now)).toBe("invalid")
    expect(verifyFileSignature("x", now + 61, sig, now)).toBe("invalid")
  })

  it("limits deal files to the deal's parties", async () => {
    const created = await createUpload("creator", { kind: "DELIVERABLE", fileName: "cut.pdf", mimeType: "application/pdf", sizeBytes: 9, dealId: ids.signed })
    expect(created.statusCode).toBe(201)
    const { asset, upload } = created.json().data
    await app.inject({ method: "PUT", url: upload.url, headers: { ...auth("creator"), "content-type": "application/pdf" }, payload: Buffer.from("%PDF-1.4\n") })
    await app.inject({ method: "POST", url: `/media/uploads/${asset.id}/complete`, headers: auth("creator") })
    expect((await app.inject({ method: "GET", url: `/media/${asset.id}`, headers: auth("brand") })).statusCode).toBe(200)
    expect((await app.inject({ method: "GET", url: `/media/${asset.id}`, headers: auth("admin") })).statusCode).toBe(200)
    expect((await app.inject({ method: "GET", url: `/media/${asset.id}`, headers: auth("outsider") })).statusCode).toBe(403)
  })
})

describe("PDFs", () => {
  it("requires both signatures for the contract PDF", async () => {
    const res = await app.inject({ method: "POST", url: `/media/contracts/${ids.unsigned}/pdf`, headers: auth("brand") })
    expect(res.statusCode).toBe(409)
    expect((await app.inject({ method: "POST", url: `/media/contracts/${ids.signed}/pdf`, headers: auth("outsider") })).statusCode).toBe(403)
  })

  it("stores the signed contract as a CONTRACT_PDF asset, idempotently", async () => {
    const first = await app.inject({ method: "POST", url: `/media/contracts/${ids.signed}/pdf`, headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN! } })
    expect(first.statusCode).toBe(201)
    const { asset, download } = first.json().data
    expect(asset).toMatchObject({ kind: "CONTRACT_PDF", status: "READY", mimeType: "application/pdf", dealId: ids.signed, ownerId: ids.user_brand })
    const second = await app.inject({ method: "POST", url: `/media/contracts/${ids.signed}/pdf`, headers: auth("creator") })
    expect(second.statusCode).toBe(200)
    expect(second.json().data.asset.id).toBe(asset.id)
    const file = await app.inject({ method: "GET", url: download.url })
    expect(file.headers["content-type"]).toBe("application/pdf")
    expect(file.rawPayload.subarray(0, 5).toString()).toBe("%PDF-")

    const stream = await app.inject({ method: "GET", url: `/media/contracts/${ids.signed}/pdf`, headers: auth("creator") })
    expect(stream.statusCode).toBe(200)
    expect(stream.headers["content-type"]).toBe("application/pdf")
  })

  it("renders the media kit and deal report as application/pdf", async () => {
    const kit = await app.inject({ method: "GET", url: `/media/media-kit/${ids.creator}`, headers: auth("brand") })
    expect(kit.statusCode).toBe(200)
    expect(kit.headers["content-type"]).toBe("application/pdf")
    expect(kit.rawPayload.subarray(0, 5).toString()).toBe("%PDF-")
    expect((await app.inject({ method: "GET", url: `/media/media-kit/${randomUUID()}`, headers: auth("brand") })).statusCode).toBe(404)
    expect((await app.inject({ method: "GET", url: `/media/media-kit/${ids.creator}` })).statusCode).toBe(401)

    const report = await app.inject({ method: "GET", url: `/media/reports/deals/${ids.signed}`, headers: auth("brand") })
    expect(report.statusCode).toBe(200)
    expect(report.headers["content-type"]).toBe("application/pdf")
    expect(report.rawPayload.length).toBeGreaterThan(1000)
    expect((await app.inject({ method: "GET", url: `/media/reports/deals/${ids.signed}`, headers: auth("outsider") })).statusCode).toBe(403)
  })
})
