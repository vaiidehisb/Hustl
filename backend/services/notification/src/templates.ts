// Notification copy. One pure function per event type: given the facts the
// consumer resolved from the DB/payload, return who gets what. The consumer maps
// audiences to user ids; nothing here touches I/O.

export type Audience = "brand" | "creator" | "admin"

export type NotificationDraft = {
  audience: Audience
  title: string
  body: string
  href: string
  /** Send an email too (high-value events only; still subject to SendGrid being configured). */
  email?: boolean
}

export type DealFacts = { id: string; title: string; brandName: string; creatorName: string }

const inr = (amount: number) => `₹${Math.round(amount).toLocaleString("en-IN")}`
const quote = (s: string) => `“${s}”`
const brandDeal = (id: string) => `/brand/deals/${id}`
const creatorDeal = (id: string) => `/creator/deals/${id}`
const dealHref = (audience: Audience, id: string) => (audience === "admin" ? "/admin" : audience === "brand" ? brandDeal(id) : creatorDeal(id))
const other = (party: "brand" | "creator"): "brand" | "creator" => (party === "brand" ? "creator" : "brand")
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function applicationSubmitted(f: { briefId: string; briefTitle: string; creatorName: string }): NotificationDraft[] {
  return [
    {
      audience: "brand",
      title: "New application",
      body: `${f.creatorName} applied to ${quote(f.briefTitle)}.`,
      href: `/brand/briefs/${f.briefId}`,
    },
  ]
}

const APPLICATION_COPY: Record<string, { title: string; body: (brief: string, brand: string) => string }> = {
  SHORTLISTED: { title: "You've been shortlisted", body: (b, n) => `${n} shortlisted your application for ${quote(b)}. You can now message them.` },
  OFFERED: { title: "Application moved to offer", body: (b, n) => `${n} is preparing an offer for ${quote(b)}.` },
  REJECTED: { title: "Application update", body: (b, n) => `${n} went with other creators for ${quote(b)}. Keep applying, new briefs are posted daily.` },
}

export function applicationStatusChanged(f: { status: string; briefTitle: string; brandName: string }): NotificationDraft[] {
  const copy = APPLICATION_COPY[f.status]
  // WITHDRAWN is the creator's own action; APPLIED is not a transition worth notifying.
  if (!copy) return []
  return [{ audience: "creator", title: copy.title, body: copy.body(f.briefTitle, f.brandName), href: "/creator/applications" }]
}

export function offerSent(f: DealFacts & { amount: number | null }): NotificationDraft[] {
  const amount = f.amount != null ? ` for ${inr(f.amount)}` : ""
  return [
    {
      audience: "creator",
      title: "New offer received",
      body: `${f.brandName} sent you an offer${amount}: ${quote(f.title)}.`,
      href: creatorDeal(f.id),
      email: true,
    },
  ]
}

export function offerCountered(f: DealFacts & { counteredBy: "brand" | "creator"; amount: number | null }): NotificationDraft[] {
  const to = other(f.counteredBy)
  const who = f.counteredBy === "brand" ? f.brandName : f.creatorName
  const amount = f.amount != null ? ` at ${inr(f.amount)}` : ""
  return [{ audience: to, title: "Counter-offer received", body: `${who} countered${amount} on ${quote(f.title)}.`, href: dealHref(to, f.id) }]
}

export function offerAccepted(f: DealFacts & { acceptedBy: "brand" | "creator" }): NotificationDraft[] {
  const to = other(f.acceptedBy)
  const who = f.acceptedBy === "brand" ? f.brandName : f.creatorName
  return [
    {
      audience: to,
      title: "Offer accepted",
      body: `${who} accepted the terms for ${quote(f.title)}. Next step: sign the contract.`,
      href: dealHref(to, f.id),
    },
  ]
}

export function offerDeclined(f: DealFacts & { declinedBy: "brand" | "creator" }): NotificationDraft[] {
  const to = other(f.declinedBy)
  const who = f.declinedBy === "brand" ? f.brandName : f.creatorName
  return [{ audience: to, title: "Offer declined", body: `${who} declined the offer for ${quote(f.title)}.`, href: dealHref(to, f.id) }]
}

/** `pending` = parties who still need to sign (empty when fully signed). */
export function contractSigned(f: DealFacts & { pending: ("brand" | "creator")[] }): NotificationDraft[] {
  if (f.pending.length === 0) {
    return (["brand", "creator"] as const).map((a) => ({
      audience: a,
      title: "Contract signed",
      body:
        a === "brand"
          ? `Both parties signed the contract for ${quote(f.title)}. Fund escrow so ${f.creatorName} can start.`
          : `Both parties signed the contract for ${quote(f.title)}. Work starts once ${f.brandName} funds escrow.`,
      href: dealHref(a, f.id),
    }))
  }
  return f.pending.map((a) => {
    const signer = a === "brand" ? f.creatorName : f.brandName
    return {
      audience: a,
      title: "Contract ready to sign",
      body: `${signer} signed the contract for ${quote(f.title)}. Review and sign to continue.`,
      href: dealHref(a, f.id),
      email: true,
    }
  })
}

export function dealFunded(f: DealFacts & { amount: number | null }): NotificationDraft[] {
  const amount = f.amount != null ? `${inr(f.amount)} is` : "Payment is"
  return [
    {
      audience: "creator",
      title: "Escrow funded — start work",
      body: `${amount} secured in escrow for ${quote(f.title)}. You're clear to start.`,
      href: creatorDeal(f.id),
      email: true,
    },
    { audience: "brand", title: "Escrow funded", body: `Your payment for ${quote(f.title)} is held in escrow until you approve the work.`, href: brandDeal(f.id) },
  ]
}

export function milestoneSubmitted(f: DealFacts & { milestoneTitle: string | null }): NotificationDraft[] {
  const what = f.milestoneTitle ? quote(f.milestoneTitle) : "a deliverable"
  return [
    {
      audience: "brand",
      title: "Deliverable submitted",
      body: `${f.creatorName} submitted ${what} for ${quote(f.title)}. Review and approve or request a revision.`,
      href: brandDeal(f.id),
      email: true,
    },
  ]
}

export function milestoneApproved(f: DealFacts & { milestoneTitle: string | null }): NotificationDraft[] {
  const what = f.milestoneTitle ? quote(f.milestoneTitle) : "Your deliverable"
  return [{ audience: "creator", title: "Deliverable approved", body: `${f.brandName} approved ${what} on ${quote(f.title)}. Payment release is on its way.`, href: creatorDeal(f.id) }]
}

export function milestoneRevisionRequested(f: DealFacts & { milestoneTitle: string | null; note: string | null }): NotificationDraft[] {
  const what = f.milestoneTitle ? quote(f.milestoneTitle) : "your deliverable"
  const note = f.note ? ` Note: ${clip(f.note)}` : ""
  return [{ audience: "creator", title: "Revision requested", body: `${f.brandName} requested changes to ${what} on ${quote(f.title)}.${note}`, href: creatorDeal(f.id) }]
}

export function paymentReleased(f: DealFacts & { net: number | null; milestoneTitle: string | null }): NotificationDraft[] {
  const amount = f.net != null ? `${inr(f.net)} was` : "A payment was"
  const what = f.milestoneTitle ? ` for ${quote(f.milestoneTitle)}` : ""
  return [
    {
      audience: "creator",
      title: "Payment released",
      body: `${amount} released to you${what} on ${quote(f.title)}.`,
      href: "/creator/earnings",
      email: true,
    },
  ]
}

export function paymentRefunded(f: DealFacts & { amount: number | null }): NotificationDraft[] {
  const amount = f.amount != null ? `${inr(f.amount)} was` : "A payment was"
  return [{ audience: "brand", title: "Refund issued", body: `${amount} refunded from escrow on ${quote(f.title)}.`, href: brandDeal(f.id) }]
}

export function dealCompleted(f: DealFacts): NotificationDraft[] {
  return [
    { audience: "brand", title: "Deal completed", body: `${quote(f.title)} with ${f.creatorName} is complete. Leave a review to help other brands.`, href: brandDeal(f.id) },
    { audience: "creator", title: "Deal completed", body: `${quote(f.title)} with ${f.brandName} is complete. Nice work — leave a review.`, href: creatorDeal(f.id) },
  ]
}

export function dealCancelled(f: DealFacts): NotificationDraft[] {
  return (["brand", "creator"] as const).map((a) => ({
    audience: a,
    title: "Deal cancelled",
    body: `${quote(f.title)} was cancelled. The conversation stays readable for 30 days.`,
    href: dealHref(a, f.id),
  }))
}

export function disputeOpened(f: DealFacts & { raisedBy: "brand" | "creator" | null; reason: string | null }): NotificationDraft[] {
  const who = f.raisedBy === "brand" ? f.brandName : f.raisedBy === "creator" ? f.creatorName : "A party"
  const reason = f.reason ? ` Reason: ${clip(f.reason)}` : ""
  const parties = (["brand", "creator"] as const).map((a) => ({
    audience: a,
    title: "Dispute opened",
    body:
      a === f.raisedBy
        ? `You opened a dispute on ${quote(f.title)}. Escrow is frozen while our team reviews it.`
        : `${who} opened a dispute on ${quote(f.title)}. Escrow is frozen while our team reviews it.`,
    href: dealHref(a, f.id),
    email: true,
  }))
  return [
    ...parties,
    { audience: "admin", title: "New dispute to review", body: `${who} disputed ${quote(f.title)} (${f.brandName} × ${f.creatorName}).${reason}`, href: "/admin" },
  ]
}

const RESOLUTION_COPY: Record<string, (splitCreatorPercent: number | null) => string> = {
  RELEASE_TO_CREATOR: () => "Funds were released to the creator.",
  REFUND_TO_BRAND: () => "Funds were refunded to the brand.",
  SPLIT: (p) => (p != null ? `Funds were split: ${p}% to the creator, ${100 - p}% to the brand.` : "Funds were split between both parties."),
}

export function disputeResolved(f: DealFacts & { resolution: string | null; splitCreatorPercent: number | null }): NotificationDraft[] {
  const outcome = f.resolution && RESOLUTION_COPY[f.resolution] ? ` ${RESOLUTION_COPY[f.resolution](f.splitCreatorPercent)}` : ""
  return [
    ...(["brand", "creator"] as const).map((a) => ({
      audience: a,
      title: "Dispute resolved",
      body: `The dispute on ${quote(f.title)} has been resolved.${outcome}`,
      href: dealHref(a, f.id),
      email: true,
    })),
    { audience: "admin", title: "Dispute resolved", body: `Dispute on ${quote(f.title)} closed.${outcome}`, href: "/admin" },
  ]
}

export function fraudFlagged(f: { label: string | null; severity: string | null; subject: string | null; subjectName: string | null }): NotificationDraft[] {
  const sev = f.severity ? `${f.severity.toLowerCase()} severity` : "new"
  const about = f.subjectName ? ` on ${f.subjectName}` : f.subject ? ` on a ${f.subject.toLowerCase()}` : ""
  const label = f.label ? `: ${f.label}` : ""
  return [{ audience: "admin", title: "Fraud flag raised", body: `A ${sev} flag was raised${about}${label}.`, href: "/admin" }]
}

export function kycVerified(f: { role: "brand" | "creator" | null }): NotificationDraft[] {
  if (!f.role) return []
  return [
    {
      audience: f.role,
      title: "Verification complete",
      body: f.role === "brand" ? "Your business is verified. Your profile now shows the verified badge." : "Your identity is verified. You can now receive payouts.",
      href: `/${f.role}/settings`,
    },
  ]
}
