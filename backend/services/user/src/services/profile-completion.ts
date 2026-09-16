import type { BrandCompletionField, CreatorCompletionField, ProfileCompletion } from "@hustl/contracts"

type CreatorFields = {
  headline: string
  bio: string
  location: string
  niches: string[]
  rateCard: unknown
  portfolio: unknown
  avatarUrl: string | null
}

type BrandFields = {
  companyName: string
  logoUrl: string | null
  website: string
  industry: string
  description: string
  location: string
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0
const nonEmptyArray = (v: unknown) => Array.isArray(v) && v.length > 0

function toCompletion<F extends string>(checks: [F, boolean][]): ProfileCompletion {
  const missing = checks.filter(([, done]) => !done).map(([field]) => field)
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing: missing as ProfileCompletion["missing"] }
}

/** `connectedSocialAccounts` is the creator's social_accounts count (excluding disconnected ones). */
export function creatorCompletion(p: CreatorFields, connectedSocialAccounts: number): ProfileCompletion {
  return toCompletion<CreatorCompletionField>([
    ["headline", filled(p.headline)],
    ["bio", filled(p.bio)],
    ["location", filled(p.location)],
    ["niches", nonEmptyArray(p.niches)],
    ["rateCard", nonEmptyArray(p.rateCard)],
    ["portfolio", nonEmptyArray(p.portfolio)],
    ["avatar", filled(p.avatarUrl)],
    ["socialAccount", connectedSocialAccounts > 0],
  ])
}

export function brandCompletion(b: BrandFields): ProfileCompletion {
  return toCompletion<BrandCompletionField>([
    ["companyName", filled(b.companyName)],
    ["logo", filled(b.logoUrl)],
    ["website", filled(b.website)],
    ["industry", filled(b.industry)],
    ["description", filled(b.description)],
    ["location", filled(b.location)],
  ])
}

export const ROLE_MISSING_COMPLETION: ProfileCompletion = { percent: 0, missing: ["role"] }
export const ADMIN_COMPLETION: ProfileCompletion = { percent: 100, missing: [] }
