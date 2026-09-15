// Deal state machine (architecture doc §4.3). Every transition is validated
// server-side; anything not listed here is rejected with a 409.

export const DEAL_STATUS = {
  OFFER_SENT: "OFFER_SENT",
  CONTRACT_PENDING: "CONTRACT_PENDING",
  CONTRACT_SIGNED: "CONTRACT_SIGNED",
  FUNDED: "FUNDED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  DISPUTED: "DISPUTED",
  CANCELLED: "CANCELLED",
} as const
export type DealStatus = (typeof DEAL_STATUS)[keyof typeof DEAL_STATUS]

export type DealAction =
  | "ACCEPT"
  | "COUNTER"
  | "DECLINE"
  | "SIGN"
  | "FUND"
  | "START"
  | "COMPLETE"
  | "DISPUTE"
  | "RESOLVE"
  | "CANCEL"

export type Party = "BRAND" | "CREATOR" | "ADMIN"

type Rule = { to: DealStatus; by: Party[] }

const TRANSITIONS: Record<DealStatus, Partial<Record<DealAction, Rule>>> = {
  OFFER_SENT: {
    ACCEPT: { to: "CONTRACT_PENDING", by: ["BRAND", "CREATOR"] },
    COUNTER: { to: "OFFER_SENT", by: ["BRAND", "CREATOR"] },
    DECLINE: { to: "CANCELLED", by: ["BRAND", "CREATOR"] },
  },
  CONTRACT_PENDING: {
    SIGN: { to: "CONTRACT_SIGNED", by: ["BRAND", "CREATOR"] },
    CANCEL: { to: "CANCELLED", by: ["BRAND", "CREATOR"] },
  },
  CONTRACT_SIGNED: {
    FUND: { to: "FUNDED", by: ["BRAND"] },
    CANCEL: { to: "CANCELLED", by: ["BRAND", "CREATOR"] },
  },
  FUNDED: {
    START: { to: "IN_PROGRESS", by: ["CREATOR", "BRAND"] },
    DISPUTE: { to: "DISPUTED", by: ["BRAND", "CREATOR"] },
  },
  IN_PROGRESS: {
    COMPLETE: { to: "COMPLETED", by: ["BRAND"] },
    DISPUTE: { to: "DISPUTED", by: ["BRAND", "CREATOR"] },
  },
  DISPUTED: {
    RESOLVE: { to: "IN_PROGRESS", by: ["ADMIN"] },
    CANCEL: { to: "CANCELLED", by: ["ADMIN"] },
  },
  COMPLETED: {},
  CANCELLED: {},
}

export const MAX_NEGOTIATION_ROUNDS = 2
export const DISPUTE_WINDOW_HOURS = 72

export class DealTransitionError extends Error {
  status = 409
  constructor(message: string) {
    super(message)
    this.name = "DealTransitionError"
  }
}

export function nextStatus(current: string, action: DealAction, party: Party): DealStatus {
  const rule = TRANSITIONS[current as DealStatus]?.[action]
  if (!rule) throw new DealTransitionError(`Cannot ${action.toLowerCase()} a deal that is ${label(current)}.`)
  if (!rule.by.includes(party)) throw new DealTransitionError(`${party.toLowerCase()} cannot ${action.toLowerCase()} this deal.`)
  return rule.to
}

export function allowedActions(current: string, party: Party): DealAction[] {
  const rules = TRANSITIONS[current as DealStatus] ?? {}
  return (Object.keys(rules) as DealAction[]).filter((a) => rules[a]!.by.includes(party))
}

const LABELS: Record<string, string> = {
  OFFER_SENT: "Offer sent",
  CONTRACT_PENDING: "Awaiting signatures",
  CONTRACT_SIGNED: "Contract signed",
  FUNDED: "Funded",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
  // milestones
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  REVISION_REQUESTED: "Revision requested",
  APPROVED: "Approved",
  RELEASED: "Paid out",
  REFUNDED: "Refunded",
  DISPUTED_MILESTONE: "Disputed",
  // briefs / applications
  DRAFT: "Draft",
  PUBLISHED: "Live",
  CLOSED: "Closed",
  APPLIED: "Applied",
  SHORTLISTED: "Shortlisted",
  OFFERED: "Offer sent",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
  OPEN: "Open",
  RESOLVED: "Resolved",
}
export const label = (status: string) => LABELS[status] ?? status

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand"
const TONES: Record<string, Tone> = {
  OFFER_SENT: "info",
  CONTRACT_PENDING: "warning",
  CONTRACT_SIGNED: "info",
  FUNDED: "brand",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  DISPUTED: "danger",
  CANCELLED: "neutral",
  PENDING: "neutral",
  SUBMITTED: "warning",
  REVISION_REQUESTED: "danger",
  APPROVED: "info",
  RELEASED: "success",
  REFUNDED: "neutral",
  DRAFT: "neutral",
  PUBLISHED: "success",
  CLOSED: "neutral",
  APPLIED: "info",
  SHORTLISTED: "brand",
  OFFERED: "success",
  REJECTED: "neutral",
  WITHDRAWN: "neutral",
  OPEN: "danger",
  RESOLVED: "success",
}
export const tone = (status: string): Tone => TONES[status] ?? "neutral"

/** Ordered stages shown in the deal progress tracker. */
export const DEAL_STAGES: { status: DealStatus; label: string }[] = [
  { status: "OFFER_SENT", label: "Offer" },
  { status: "CONTRACT_PENDING", label: "Contract" },
  { status: "CONTRACT_SIGNED", label: "Signed" },
  { status: "FUNDED", label: "Escrow funded" },
  { status: "IN_PROGRESS", label: "Delivery" },
  { status: "COMPLETED", label: "Complete" },
]
