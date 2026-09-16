// Pure business rules for offers: milestone resolution, upfront eligibility,
// fee snapshot and the new-brand fraud hold.

import {
  brandFeeRateForPlan,
  CREATOR_FEE_RATE,
  defaultMilestones,
  FRAUD_HIGH_VALUE_AMOUNT,
  FRAUD_HOLD_HOURS,
  FRAUD_NEW_BRAND_DAYS,
  MAX_COUNTER_ROUNDS,
  PROCESSING_FEE_RATE,
  splitMilestones,
  UPFRONT_MIN_RELIABILITY,
  type MilestoneInput,
  type PaymentMode,
  type SplitMilestone,
} from "@hustl/contracts"
import { errors } from "@hustl/common"

export { splitMilestones }

/** Resolve the milestone plan for an offer (defaults to one 100% milestone) and split the amount exactly. */
export function resolveMilestones(amount: number, mode: PaymentMode, milestones: MilestoneInput[] | undefined, dueDate?: string | null): SplitMilestone[] {
  const plan = milestones?.length ? milestones : defaultMilestones(mode, dueDate)
  if (mode === "MILESTONES" && plan.length < 2) throw errors.validation("Milestone payment mode needs at least two milestones", { fieldErrors: { milestones: ["At least two milestones"] } })
  if (mode !== "MILESTONES" && mode !== "UPFRONT" && plan.length > 1)
    throw errors.validation("Completion payment mode uses a single milestone", { fieldErrors: { milestones: ["Use MILESTONES mode for multiple milestones"] } })
  try {
    return splitMilestones(amount, plan)
  } catch (err) {
    throw errors.validation((err as Error).message, { fieldErrors: { milestones: [(err as Error).message] } })
  }
}

export type UpfrontEligibility = { eligible: boolean; reasons: string[] }

/** Upfront mode needs creator reliability strictly above 85 (missing score = not eligible) and a KYC-verified brand user. */
export function upfrontEligibility(input: { reliabilityScore: number | null | undefined; brandKycStatus: string }): UpfrontEligibility {
  const reasons: string[] = []
  if (input.reliabilityScore == null) reasons.push("Creator has no reliability score yet")
  else if (input.reliabilityScore <= UPFRONT_MIN_RELIABILITY) reasons.push(`Creator reliability must be above ${UPFRONT_MIN_RELIABILITY}`)
  if (input.brandKycStatus !== "VERIFIED") reasons.push("Brand KYC must be verified")
  return { eligible: reasons.length === 0, reasons }
}

export function feeSnapshot(plan: string) {
  return { brandFeeRate: brandFeeRateForPlan(plan), creatorFeeRate: CREATOR_FEE_RATE, processingFeeRate: PROCESSING_FEE_RATE }
}

/** New brand account (< 7 days) sending ≥ ₹1,00,000 → 24h hold before funding. */
export function fraudHold(input: { brandUserCreatedAt: Date; amount: number; now?: Date }): { holdUntil: Date; brandAgeHours: number } | null {
  const now = input.now ?? new Date()
  const ageMs = now.getTime() - input.brandUserCreatedAt.getTime()
  if (ageMs < FRAUD_NEW_BRAND_DAYS * 86_400_000 && input.amount >= FRAUD_HIGH_VALUE_AMOUNT)
    return { holdUntil: new Date(now.getTime() + FRAUD_HOLD_HOURS * 3_600_000), brandAgeHours: Math.floor(ageMs / 3_600_000) }
  return null
}

export function counterRoundsRemaining(negotiationRounds: number) {
  return Math.max(0, MAX_COUNTER_ROUNDS - negotiationRounds)
}

export function assertCanCounter(negotiationRounds: number, from: string) {
  if (negotiationRounds >= MAX_COUNTER_ROUNDS)
    throw errors.conflict(`Negotiation is limited to ${MAX_COUNTER_ROUNDS} counter rounds — accept or decline the current offer`, {
      from,
      action: "COUNTER",
      maxRounds: MAX_COUNTER_ROUNDS,
    })
}

export const isOnTime = (dueDate: Date | null, submittedAt: Date | null) => (dueDate && submittedAt ? submittedAt.getTime() <= dueDate.getTime() : null)
