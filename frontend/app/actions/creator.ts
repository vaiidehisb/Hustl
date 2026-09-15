"use server"

import { revalidatePath } from "next/cache"
import { db, json } from "@/lib/db"
import { requireCreator } from "@/lib/session"
import { applicationScore } from "@/lib/ai/match"
import { refreshCreator } from "@/lib/ai/refresh"
import { inr } from "@/lib/format"
import {
  BIO_MAX,
  HANDLE_RE,
  HEADLINE_MAX,
  NICHE_MAX,
  NICHES,
  PITCH_MAX,
  PITCH_MIN,
  SOCIAL_PLATFORMS,
  normalizeHandle,
  platformLabel,
  type PortfolioRow,
  type ProfileInput,
  type RateCardRow,
  type SocialAccount,
  type SocialInput,
} from "@/components/creator/lib"
import { run, ValidationError } from "./result"

function revalidateCreator(...handles: (string | undefined)[]) {
  revalidatePath("/creator", "layout")
  for (const h of handles) if (h) revalidatePath(`/creators/${h}`)
}

const text = (v: unknown) => String(v ?? "").trim()

// ─── Applications ────────────────────────────────────────────────────────────

export async function applyToBriefAction(briefId: string, input: { pitch: string; proposedRate: number }) {
  return run(async () => {
    const { user, creator } = await requireCreator()
    const pitch = text(input.pitch)
    const rate = Math.round(Number(input.proposedRate))
    if (pitch.length < PITCH_MIN) throw new ValidationError(`Your pitch needs at least ${PITCH_MIN} characters — tell the brand what you'd create.`)
    if (pitch.length > PITCH_MAX) throw new ValidationError(`Keep your pitch under ${PITCH_MAX} characters.`)
    if (!Number.isFinite(rate) || rate < 500) throw new ValidationError("Enter a proposed rate of at least ₹500.")
    if (rate > 10_000_000) throw new ValidationError("That rate looks too high — double-check the amount.")

    const brief = await db.brief.findUnique({ where: { id: briefId }, include: { brand: true } })
    if (!brief || brief.status !== "PUBLISHED") throw new ValidationError("This brief is no longer accepting applications.")
    if (brief.deadline && brief.deadline < new Date()) throw new ValidationError("The application deadline for this brief has passed.")

    const existing = await db.application.findUnique({ where: { briefId_creatorId: { briefId, creatorId: creator.id } } })
    if (existing && existing.status !== "WITHDRAWN") throw new ValidationError("You've already applied to this brief.")

    const match = applicationScore(creator, brief)
    const data = {
      pitch,
      proposedRate: rate,
      status: "APPLIED",
      matchScore: match.score,
      matchReasons: match.reasons,
      disqualifiers: match.disqualifiers,
      createdAt: new Date(),
    }
    await db.application.upsert({
      where: { briefId_creatorId: { briefId, creatorId: creator.id } },
      create: { briefId, creatorId: creator.id, ...data },
      update: data,
    })
    await db.notification.create({
      data: {
        userId: brief.brand.userId,
        title: `New application for “${brief.title}”`,
        body: `${user.name} (@${creator.handle}) applied at ${inr(rate)} · ${match.score}/100 match`,
        href: `/brand/briefs/${briefId}`,
      },
    })
    revalidateCreator()
    revalidatePath(`/brand/briefs/${briefId}`)
    return { score: match.score }
  })
}

export async function withdrawApplicationAction(applicationId: string) {
  return run(async () => {
    const { user, creator } = await requireCreator()
    const app = await db.application.findFirst({
      where: { id: applicationId, creatorId: creator.id },
      include: { brief: { include: { brand: true } } },
    })
    if (!app) throw new ValidationError("Application not found.")
    if (!["APPLIED", "SHORTLISTED"].includes(app.status))
      throw new ValidationError(
        app.status === "OFFERED" ? "You already have an offer on this brief — decline it from the deal room instead." : "This application is already closed.",
      )
    await db.application.update({ where: { id: app.id }, data: { status: "WITHDRAWN" } })
    await db.notification.create({
      data: {
        userId: app.brief.brand.userId,
        title: "Application withdrawn",
        body: `${user.name} withdrew their application for “${app.brief.title}”`,
        href: `/brand/briefs/${app.briefId}`,
      },
    })
    revalidateCreator()
    revalidatePath(`/brand/briefs/${app.briefId}`)
  })
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function checkHandleAction(raw: string) {
  return run(async () => {
    const { creator } = await requireCreator()
    const handle = normalizeHandle(raw)
    if (!HANDLE_RE.test(handle)) return { available: false, reason: "invalid" as const }
    if (handle === creator.handle) return { available: true, reason: "current" as const }
    const taken = await db.creatorProfile.findUnique({ where: { handle }, select: { id: true } })
    return { available: !taken, reason: taken ? ("taken" as const) : ("ok" as const) }
  })
}

export async function saveProfileAction(input: ProfileInput) {
  return run(async () => {
    const { creator } = await requireCreator()

    const handle = normalizeHandle(input.handle)
    if (!HANDLE_RE.test(handle)) throw new ValidationError("Handles are 3–30 characters: lowercase letters, numbers, dots and underscores.")
    if (handle !== creator.handle) {
      const taken = await db.creatorProfile.findUnique({ where: { handle }, select: { id: true } })
      if (taken) throw new ValidationError(`@${handle} is already taken — try another handle.`)
    }

    const headline = text(input.headline)
    const bio = text(input.bio)
    const location = text(input.location).slice(0, 80)
    if (headline.length > HEADLINE_MAX) throw new ValidationError(`Keep your headline under ${HEADLINE_MAX} characters.`)
    if (bio.length > BIO_MAX) throw new ValidationError(`Keep your bio under ${BIO_MAX} characters.`)

    const allowed = NICHES as readonly string[]
    const niches = [...new Set((input.niches ?? []).map((n) => text(n).toLowerCase()))].filter((n) => allowed.includes(n))
    if (niches.length > NICHE_MAX) throw new ValidationError(`Pick up to ${NICHE_MAX} niches — focus helps your niche authority score.`)

    const languages = [...new Set((input.languages ?? []).map((l) => text(l).slice(0, 30)).filter(Boolean))].slice(0, 8)

    const rateCard: RateCardRow[] = []
    for (const row of input.rateCard ?? []) {
      const deliverable = text(row.deliverable).slice(0, 80)
      if (!deliverable) continue
      const price = Math.round(Number(row.price))
      if (!Number.isFinite(price) || price < 0) throw new ValidationError(`Add a valid price for “${deliverable}”.`)
      rateCard.push({ deliverable, price })
    }
    if (rateCard.length > 12) throw new ValidationError("Rate cards can have up to 12 rows.")

    const portfolio: PortfolioRow[] = []
    for (const row of input.portfolio ?? []) {
      const title = text(row.title).slice(0, 100)
      const rawUrl = text(row.url)
      if (!title && !rawUrl) continue
      if (!title) throw new ValidationError("Every portfolio link needs a title.")
      let url: URL
      try {
        url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) throw new Error()
      } catch {
        throw new ValidationError(`“${title}” needs a valid link.`)
      }
      const brand = text(row.brand).slice(0, 60)
      portfolio.push(brand ? { title, url: url.toString(), brand } : { title, url: url.toString() })
    }
    if (portfolio.length > 12) throw new ValidationError("Portfolios can have up to 12 items.")

    await db.creatorProfile.update({
      where: { id: creator.id },
      data: { handle, headline, bio, location, niches, languages, available: Boolean(input.available), rateCard, portfolio },
    })
    await refreshCreator(creator.id)
    revalidateCreator(creator.handle, handle)
    return { handle }
  })
}

// ─── Socials ─────────────────────────────────────────────────────────────────

/** Recomputes aggregate reach from connected accounts, then re-scores. */
async function writeSocials(creatorId: string, platforms: SocialAccount[]) {
  const followers = platforms.reduce((s, p) => s + p.followers, 0)
  const weighted = followers ? platforms.reduce((s, p) => s + p.followers * p.engagementRate, 0) / followers : 0
  await db.creatorProfile.update({
    where: { id: creatorId },
    data: {
      platforms,
      followers,
      engagementRate: Math.round(weighted * 100_000) / 100_000,
      socialsConnected: platforms.length > 0,
      lastSyncedAt: platforms.length ? new Date() : null,
    },
  })
  await refreshCreator(creatorId)
}

export async function saveSocialAction(input: SocialInput) {
  return run(async () => {
    const { creator } = await requireCreator()
    const platform = text(input.platform).toLowerCase()
    if (!(SOCIAL_PLATFORMS as readonly string[]).includes(platform)) throw new ValidationError("Unsupported platform.")
    const handle = text(input.handle).replace(/^@+/, "").slice(0, 60)
    if (!handle) throw new ValidationError(`Enter your ${platformLabel(platform)} handle.`)
    const followers = Math.round(Number(input.followers))
    if (!Number.isFinite(followers) || followers < 0 || followers > 1_000_000_000) throw new ValidationError("Enter a valid follower count.")
    const er = Number(input.engagementPct)
    if (!Number.isFinite(er) || er < 0 || er > 100) throw new ValidationError("Engagement rate must be between 0 and 100%.")
    const avgViews = Math.round(Number(input.avgViews) || 0)
    if (avgViews < 0) throw new ValidationError("Average views can't be negative.")

    const current = json<SocialAccount[]>(creator.platforms, []).filter((p) => p.platform.toLowerCase() !== platform)
    const next: SocialAccount = { platform, handle, followers, engagementRate: Math.round(er * 1000) / 100_000, avgViews }
    const ordered = [...current, next].sort(
      (a, b) => SOCIAL_PLATFORMS.indexOf(a.platform.toLowerCase() as never) - SOCIAL_PLATFORMS.indexOf(b.platform.toLowerCase() as never),
    )
    await writeSocials(creator.id, ordered)
    revalidateCreator(creator.handle)
  })
}

export async function removeSocialAction(platform: string) {
  return run(async () => {
    const { creator } = await requireCreator()
    const next = json<SocialAccount[]>(creator.platforms, []).filter((p) => p.platform.toLowerCase() !== platform.toLowerCase())
    await writeSocials(creator.id, next)
    revalidateCreator(creator.handle)
  })
}

/** Test mode: re-reads self-reported numbers. With Phyllo connected this pulls live stats. */
export async function syncSocialsAction() {
  return run(async () => {
    const { creator } = await requireCreator()
    const platforms = json<SocialAccount[]>(creator.platforms, [])
    if (!platforms.length) throw new ValidationError("Connect at least one account before syncing.")
    await writeSocials(creator.id, platforms)
    revalidateCreator(creator.handle)
    return { syncedAt: new Date().toISOString() }
  })
}
