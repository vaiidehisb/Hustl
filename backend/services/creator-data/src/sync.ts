// Phyllo → social_accounts synchronisation (webhooks, manual sync, 24h scheduler).

import { prisma, type Prisma } from "@hustl/db"
import { createLogger, publish, TOPICS } from "@hustl/common"
import type { SocialSyncResult } from "@hustl/contracts"
import { engagementFromContents, mapWorkPlatform, phyllo, phylloStatus, type PhylloAccount } from "./integrations/phyllo"
import { applyMetrics, recomputeAndPublish } from "./normalise"

const log = createLogger("creator-data-service:sync")

/** Fetches profile, engagement and audience for one Phyllo account and writes them. */
export async function syncPhylloAccount(creatorId: string, account: PhylloAccount) {
  const platform = mapWorkPlatform(account.work_platform?.name)
  if (!platform) return null

  const handle = account.platform_username ?? account.username ?? ""
  const existing = await prisma.socialAccount.findUnique({ where: { creatorId_platform: { creatorId, platform } } })
  // Verified provider data supersedes a self-reported entry for the same platform.
  const row = existing
    ? await prisma.socialAccount.update({
        where: { id: existing.id },
        data: { source: "PHYLLO", externalAccountId: account.id, handle: handle || existing.handle },
      })
    : await prisma.socialAccount.create({
        data: { creatorId, platform, source: "PHYLLO", status: "PENDING", externalAccountId: account.id, handle: handle || account.id },
      })

  if (account.status !== "CONNECTED") {
    const status = account.status === "NOT_CONNECTED" ? "DISCONNECTED" : "ERROR"
    await prisma.socialAccount.update({ where: { id: row.id }, data: { status, syncError: `Phyllo account status ${account.status}` } })
    await recomputeAndPublish(creatorId)
    return { socialAccountId: row.id, platform, status, error: `Phyllo account status ${account.status}` } as const
  }

  try {
    const profile = await phyllo.getProfile(account.id)
    if (!profile) throw new Error("Phyllo has no profile for this account yet")
    const rep = profile.reputation ?? {}
    const followers = rep.follower_count ?? rep.subscriber_count ?? null
    if (followers == null) throw new Error("Phyllo profile has no follower count yet")
    const [contents, audience] = await Promise.all([phyllo.listRecentContents(account.id).catch(() => []), phyllo.getAudience(account.id)])
    const engagement = engagementFromContents(contents, followers)

    await prisma.$transaction(async (tx) => {
      await applyMetrics(
        tx,
        { id: row.id, creatorId, platform, source: "PHYLLO" },
        {
          followers,
          following: rep.following_count ?? null,
          postsCount: rep.content_count ?? null,
          avgLikes: engagement.avgLikes,
          avgComments: engagement.avgComments,
          avgViews: engagement.avgViews,
          engagementRate: engagement.engagementRate,
        },
        {
          status: "CONNECTED",
          handle: profile.platform_username ?? profile.username ?? row.handle,
          profileUrl: profile.url ?? null,
          ...(audience && { audienceDemographics: audience as Prisma.InputJsonValue }),
          lastSyncedAt: new Date(),
          syncError: null,
        },
      )
    })
    return { socialAccountId: row.id, platform, status: "CONNECTED", error: null } as const
  } catch (err) {
    const message = (err as Error).message.slice(0, 500)
    await prisma.socialAccount.update({ where: { id: row.id }, data: { status: "ERROR", syncError: message, lastSyncedAt: new Date() } })
    log.warn({ err, creatorId, accountId: account.id }, "phyllo account sync failed")
    return { socialAccountId: row.id, platform, status: "ERROR", error: message } as const
  }
}

/** Discovers and syncs all connected Phyllo accounts for a creator. */
export async function syncCreator(creatorId: string): Promise<SocialSyncResult> {
  const user = await phyllo.getUserByExternalId(creatorId)
  const synced: SocialSyncResult["synced"] = []
  if (user) {
    for (const account of await phyllo.listAccounts(user.id)) {
      const r = await syncPhylloAccount(creatorId, account)
      if (r) synced.push(r)
    }
    await prisma.$transaction((tx) => publish(tx, TOPICS.CREATOR_SYNC_COMPLETED, creatorId, { creatorId, stage: "phyllo", accounts: synced.length }))
  }
  return { creatorId, synced }
}

/** Handles a verified Phyllo webhook payload. */
export async function handlePhylloWebhook(body: { event?: string; name?: string; data?: Record<string, unknown> }) {
  const event = String(body.event ?? body.name ?? "")
  const data = body.data ?? {}
  const accountId = typeof data.account_id === "string" ? data.account_id : undefined
  if (!accountId) return { handled: false, event }

  const account = await phyllo.getAccount(accountId)
  const user = await phyllo.getUser(account.user.id)
  const creator = await prisma.creatorProfile.findUnique({ where: { id: user.external_id }, select: { id: true } }).catch(() => null)
  if (!creator) return { handled: false, event, reason: "unknown external_id" }

  if (event === "ACCOUNTS.DISCONNECTED") {
    await prisma.socialAccount.updateMany({ where: { creatorId: creator.id, externalAccountId: accountId }, data: { status: "DISCONNECTED" } })
    await recomputeAndPublish(creator.id)
    return { handled: true, event }
  }
  const result = await syncPhylloAccount(creator.id, account)
  return { handled: !!result, event, result }
}

const HOUR = 60 * 60 * 1000

/**
 * Every hour, re-syncs CONNECTED Phyllo accounts whose last sync is older than
 * 24h — i.e. each account is refreshed once a day. Skips when Phyllo isn't configured.
 */
export function startScheduler(intervalMs = HOUR) {
  let running = false
  const tick = async () => {
    if (running || !phylloStatus().configured) return
    running = true
    try {
      const stale = await prisma.socialAccount.findMany({
        where: {
          source: "PHYLLO",
          status: "CONNECTED",
          externalAccountId: { not: null },
          OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - 24 * HOUR) } }],
        },
        select: { creatorId: true, externalAccountId: true },
        take: 500,
      })
      for (const a of stale) {
        try {
          await syncPhylloAccount(a.creatorId, await phyllo.getAccount(a.externalAccountId!))
        } catch (err) {
          log.error({ err, creatorId: a.creatorId }, "scheduled sync failed")
        }
      }
      if (stale.length) log.info({ accounts: stale.length }, "scheduled phyllo sync finished")
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), intervalMs)
  const first = setTimeout(() => void tick(), 60_000)
  return () => {
    clearInterval(timer)
    clearTimeout(first)
  }
}
