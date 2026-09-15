// Pure deal + milestone state machines. No I/O: callers persist the result,
// write the deal_events row and publish the event in one transaction.

import { AppError, errors } from "@hustl/common"
import type { DealAction, DealStatus, MilestoneAction, MilestoneStatus } from "@hustl/contracts"

/** SYSTEM = transitions driven by events (payment funded, releases, dispute resolution). */
export type Actor = "BRAND" | "CREATOR" | "ADMIN" | "SYSTEM"

type Rule<S extends string> = { to: S; by: readonly Actor[] }

const PARTIES = ["BRAND", "CREATOR"] as const

export const DEAL_TRANSITIONS: Record<DealStatus, Partial<Record<DealAction, Rule<DealStatus>>>> = {
  OFFER_SENT: {
    COUNTER: { to: "NEGOTIATING", by: PARTIES },
    ACCEPT: { to: "AGREED", by: PARTIES },
    DECLINE: { to: "CANCELLED", by: PARTIES },
    CANCEL: { to: "CANCELLED", by: [...PARTIES, "ADMIN"] },
  },
  NEGOTIATING: {
    COUNTER: { to: "NEGOTIATING", by: PARTIES },
    ACCEPT: { to: "AGREED", by: PARTIES },
    DECLINE: { to: "CANCELLED", by: PARTIES },
    CANCEL: { to: "CANCELLED", by: [...PARTIES, "ADMIN"] },
  },
  AGREED: {
    SIGN: { to: "CONTRACT_SIGNED", by: PARTIES },
    CANCEL: { to: "CANCELLED", by: [...PARTIES, "ADMIN"] },
  },
  CONTRACT_SIGNED: {
    FUND: { to: "FUNDED", by: ["SYSTEM"] },
    CANCEL: { to: "CANCELLED", by: [...PARTIES, "ADMIN"] },
  },
  FUNDED: {
    START: { to: "IN_PROGRESS", by: ["SYSTEM"] },
    DISPUTE: { to: "DISPUTED", by: PARTIES },
  },
  IN_PROGRESS: {
    COMPLETE: { to: "COMPLETED", by: ["SYSTEM"] },
    DISPUTE: { to: "DISPUTED", by: PARTIES },
    // Only reachable when every milestone was refunded (dispute outcome).
    CANCEL: { to: "CANCELLED", by: ["SYSTEM"] },
  },
  DISPUTED: {
    RESOLVE: { to: "IN_PROGRESS", by: ["SYSTEM", "ADMIN"] },
    COMPLETE: { to: "COMPLETED", by: ["SYSTEM"] },
    CANCEL: { to: "CANCELLED", by: ["SYSTEM"] },
  },
  COMPLETED: {},
  CANCELLED: {},
}

export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, Partial<Record<MilestoneAction, Rule<MilestoneStatus>>>> = {
  PENDING: {
    SUBMIT: { to: "SUBMITTED", by: ["CREATOR"] },
    DISPUTE: { to: "DISPUTED", by: PARTIES },
    REFUND: { to: "REFUNDED", by: ["SYSTEM"] },
  },
  SUBMITTED: {
    APPROVE: { to: "APPROVED", by: ["BRAND"] },
    REQUEST_REVISION: { to: "REVISION_REQUESTED", by: ["BRAND"] },
    DISPUTE: { to: "DISPUTED", by: PARTIES },
    REFUND: { to: "REFUNDED", by: ["SYSTEM"] },
  },
  REVISION_REQUESTED: {
    SUBMIT: { to: "SUBMITTED", by: ["CREATOR"] },
    DISPUTE: { to: "DISPUTED", by: PARTIES },
    REFUND: { to: "REFUNDED", by: ["SYSTEM"] },
  },
  APPROVED: {
    RELEASE: { to: "RELEASED", by: ["SYSTEM"] },
    DISPUTE: { to: "DISPUTED", by: PARTIES },
    REFUND: { to: "REFUNDED", by: ["SYSTEM"] },
  },
  DISPUTED: {
    RELEASE: { to: "RELEASED", by: ["SYSTEM"] },
    REFUND: { to: "REFUNDED", by: ["SYSTEM"] },
  },
  RELEASED: {},
  REFUNDED: {},
}

export const TERMINAL_DEAL_STATUSES: readonly DealStatus[] = ["COMPLETED", "CANCELLED"]
export const SETTLED_MILESTONE_STATUSES: readonly MilestoneStatus[] = ["RELEASED", "REFUNDED"]

export function canTransition(from: DealStatus, action: DealAction, actor: Actor): boolean {
  return !!DEAL_TRANSITIONS[from]?.[action]?.by.includes(actor)
}

/**
 * Validates a deal transition and returns the target status.
 * Unknown transition from this state → 409 CONFLICT `{ from, action }`.
 * Transition exists but the actor may not perform it → 403.
 */
export function assertTransition(from: DealStatus, action: DealAction, actor: Actor): DealStatus {
  const rule = DEAL_TRANSITIONS[from]?.[action]
  if (!rule) throw new AppError("CONFLICT", `Cannot ${action.toLowerCase().replace("_", " ")} a deal that is ${from}`, { from, action })
  if (!rule.by.includes(actor)) throw errors.forbidden(`${actor} cannot ${action.toLowerCase()} this deal`)
  return rule.to
}

export function assertMilestoneTransition(from: MilestoneStatus, action: MilestoneAction, actor: Actor): MilestoneStatus {
  const rule = MILESTONE_TRANSITIONS[from]?.[action]
  if (!rule) throw new AppError("CONFLICT", `Cannot ${action.toLowerCase().replace("_", " ")} a milestone that is ${from}`, { from, action })
  if (!rule.by.includes(actor)) throw errors.forbidden(`${actor} cannot ${action.toLowerCase()} this milestone`)
  return rule.to
}

/** Raw machine view: actions this actor could take from `status` (no business context). */
export function machineActions(status: DealStatus, actor: Actor): DealAction[] {
  const rules = DEAL_TRANSITIONS[status] ?? {}
  return (Object.keys(rules) as DealAction[]).filter((a) => rules[a]!.by.includes(actor))
}

export function machineMilestoneActions(status: MilestoneStatus, actor: Actor): MilestoneAction[] {
  const rules = MILESTONE_TRANSITIONS[status] ?? {}
  return (Object.keys(rules) as MilestoneAction[]).filter((a) => rules[a]!.by.includes(actor))
}
