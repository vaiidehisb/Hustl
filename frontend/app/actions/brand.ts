"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireBrand } from "@/lib/session"
import { parseBrief, type ParsedBrief } from "@/lib/ai/brief-parser"
import { refreshBriefEmbedding } from "@/lib/ai/refresh"
import { slugify } from "@/lib/format"
import { run, ValidationError } from "./result"

const refreshBrand = () => revalidatePath("/brand", "layout")

// ─── Briefs ──────────────────────────────────────────────────────────────────

export type BriefInput = {
  title: string
  description: string
  niche: string
  platforms: string[]
  deliverables: { type: string; quantity: number }[]
  minFollowers: number
  /** fraction, e.g. 0.03 */
  minEngagement: number
  budgetPerCreator: number
  creatorsNeeded: number
  location: string
  timeline: string
  audience: string
  deadline?: string | null
  parsed?: ParsedBrief | null
}

function cleanBrief(input: BriefInput) {
  const title = input.title.trim()
  const description = input.description.trim()
  if (title.length < 4) throw new ValidationError("Give the brief a title (at least 4 characters).")
  if (description.length < 20) throw new ValidationError("Add a description of at least 20 characters so creators know what you need.")
  const int = (n: number, min = 0) => Math.max(min, Math.round(Number.isFinite(n) ? n : 0))
  const deadline = input.deadline ? new Date(input.deadline) : null
  if (deadline && Number.isNaN(deadline.getTime())) throw new ValidationError("That deadline isn't a valid date.")
  return {
    title,
    description,
    niche: input.niche.trim().toLowerCase(),
    platforms: input.platforms.map((p) => p.toLowerCase()),
    deliverables: input.deliverables.filter((d) => d.type.trim()).map((d) => ({ type: d.type.trim(), quantity: int(d.quantity, 1) })),
    minFollowers: int(input.minFollowers),
    minEngagement: Math.max(0, Math.min(1, Number(input.minEngagement) || 0)),
    budgetPerCreator: int(input.budgetPerCreator),
    creatorsNeeded: int(input.creatorsNeeded, 1),
    location: input.location.trim(),
    timeline: input.timeline.trim(),
    audience: input.audience.trim(),
    deadline,
  }
}

export async function parseBriefAction(text: string) {
  return run(async () => {
    await requireBrand()
    if (text.trim().length < 20) throw new ValidationError("Describe the campaign in a sentence or two first.")
    return parseBrief(text.slice(0, 4000))
  })
}

export async function createBriefAction(input: BriefInput, publish: boolean) {
  return run(async () => {
    const { brand } = await requireBrand()
    const data = cleanBrief(input)
    if (publish && data.budgetPerCreator <= 0) throw new ValidationError("Set a budget per creator before publishing.")
    const brief = await db.brief.create({
      data: { ...data, brandId: brand.id, status: publish ? "PUBLISHED" : "DRAFT", parsed: input.parsed ?? undefined },
    })
    await refreshBriefEmbedding(brief.id)
    refreshBrand()
    return { id: brief.id }
  })
}

export async function updateBriefAction(briefId: string, input: BriefInput, publish?: boolean) {
  return run(async () => {
    const { brand } = await requireBrand()
    const brief = await db.brief.findUnique({ where: { id: briefId } })
    if (!brief || brief.brandId !== brand.id) throw new ValidationError("Brief not found.")
    const data = cleanBrief(input)
    await db.brief.update({ where: { id: briefId }, data: { ...data, ...(publish ? { status: "PUBLISHED" } : {}) } })
    await refreshBriefEmbedding(briefId)
    refreshBrand()
    return { id: briefId }
  })
}

export async function setBriefStatusAction(briefId: string, status: "DRAFT" | "PUBLISHED" | "CLOSED") {
  return run(async () => {
    const { brand } = await requireBrand()
    const brief = await db.brief.findUnique({ where: { id: briefId } })
    if (!brief || brief.brandId !== brand.id) throw new ValidationError("Brief not found.")
    if (status === "PUBLISHED" && brief.budgetPerCreator <= 0) throw new ValidationError("Set a budget per creator before publishing.")
    await db.brief.update({ where: { id: briefId }, data: { status } })
    if (status === "PUBLISHED") await refreshBriefEmbedding(briefId)
    refreshBrand()
  })
}

// ─── Applications ────────────────────────────────────────────────────────────

export async function setApplicationStatusAction(applicationId: string, status: "APPLIED" | "SHORTLISTED" | "REJECTED") {
  return run(async () => {
    const { brand } = await requireBrand()
    const app = await db.application.findUnique({ where: { id: applicationId }, include: { brief: true, creator: true } })
    if (!app || app.brief.brandId !== brand.id) throw new ValidationError("Application not found.")
    if (app.status === "OFFERED" || app.status === "WITHDRAWN") throw new ValidationError("This application can no longer be changed.")
    await db.application.update({ where: { id: applicationId }, data: { status } })
    if (status !== "APPLIED") {
      await db.notification.create({
        data: {
          userId: app.creator.userId,
          title: status === "SHORTLISTED" ? `${brand.companyName} shortlisted you` : `Update on "${app.brief.title}"`,
          body:
            status === "SHORTLISTED"
              ? `You're on the shortlist for "${app.brief.title}". An offer may follow soon.`
              : `${brand.companyName} went with other creators this time. Keep applying!`,
          href: "/creator/applications",
        },
      })
    }
    refreshBrand()
  })
}

// ─── Creators ────────────────────────────────────────────────────────────────

export async function toggleSaveCreatorAction(creatorId: string) {
  return run(async () => {
    const { brand } = await requireBrand()
    const key = { brandId_creatorId: { brandId: brand.id, creatorId } }
    const existing = await db.savedCreator.findUnique({ where: key })
    if (existing) await db.savedCreator.delete({ where: key })
    else await db.savedCreator.create({ data: { brandId: brand.id, creatorId } })
    revalidatePath("/brand/discover")
    return { saved: !existing }
  })
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type BrandProfileInput = {
  companyName: string
  website: string
  industry: string
  description: string
  location: string
  size: string
  logoUrl: string
}

export async function updateBrandProfileAction(input: BrandProfileInput) {
  return run(async () => {
    const { brand } = await requireBrand()
    const companyName = input.companyName.trim()
    if (companyName.length < 2) throw new ValidationError("Company name is required.")
    const website = input.website.trim()
    if (website && !/^https?:\/\/\S+\.\S+/.test(website)) throw new ValidationError("Website must start with http:// or https://")
    const logoUrl = input.logoUrl.trim()
    if (logoUrl && !/^https?:\/\/\S+/.test(logoUrl)) throw new ValidationError("Logo URL must be a full http(s) link.")

    let slug = brand.slug
    if (companyName !== brand.companyName) {
      const base = slugify(companyName) || "brand"
      const taken = await db.brandProfile.findFirst({ where: { slug: base, NOT: { id: brand.id } } })
      slug = taken ? `${base}-${brand.id.slice(-4)}` : base
    }
    await db.brandProfile.update({
      where: { id: brand.id },
      data: {
        companyName,
        slug,
        website,
        industry: input.industry.trim(),
        description: input.description.trim().slice(0, 1000),
        location: input.location.trim(),
        size: input.size.trim(),
        logoUrl: logoUrl || null,
      },
    })
    refreshBrand()
    return { slug }
  })
}

export async function setPlanAction(plan: "STARTER" | "GROWTH") {
  return run(async () => {
    const { brand } = await requireBrand()
    await db.brandProfile.update({ where: { id: brand.id }, data: { plan } })
    refreshBrand()
  })
}

export async function verifyKycAction() {
  return run(async () => {
    const { user, brand } = await requireBrand()
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { kycVerified: true } }),
      db.brandProfile.update({ where: { id: brand.id }, data: { verified: true } }),
    ])
    refreshBrand()
  })
}
