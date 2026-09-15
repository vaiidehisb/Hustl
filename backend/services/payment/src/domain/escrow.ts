// Pure escrow + dispute math.

import { payoutBreakdown, type DisputeResolution, type EscrowStatus } from "@hustl/contracts"

/** Status of an unfrozen escrow derived from its amounts. */
export function settledEscrowStatus(e: { fundedAmount: number; releasedAmount: number; refundedAmount: number }): EscrowStatus {
  if (e.fundedAmount <= 0) return "UNFUNDED"
  const out = e.releasedAmount + e.refundedAmount
  if (out === 0) return "FUNDED"
  if (out >= e.fundedAmount) return e.releasedAmount > 0 ? "RELEASED" : "REFUNDED"
  return "PARTIALLY_RELEASED"
}

export const availableEscrow = (e: { fundedAmount: number; releasedAmount: number; refundedAmount: number }) => e.fundedAmount - e.releasedAmount - e.refundedAmount

/** How a disputed milestone amount is divided. Creator share is rounded; the brand gets the exact remainder. */
export function disputeSplit(amount: number, resolution: DisputeResolution, splitCreatorPercent?: number | null) {
  if (resolution === "RELEASE_TO_CREATOR") return { creatorGross: amount, brandRefund: 0 }
  if (resolution === "REFUND_TO_BRAND") return { creatorGross: 0, brandRefund: amount }
  const pct = splitCreatorPercent ?? 0
  if (!Number.isInteger(pct) || pct < 1 || pct > 99) throw new RangeError("splitCreatorPercent must be an integer between 1 and 99")
  const creatorGross = Math.round((amount * pct) / 100)
  return { creatorGross, brandRefund: amount - creatorGross }
}

export { payoutBreakdown }
