// Revenue model (architecture doc §1): brand fee 5–8% at funding, creator fee
// 5% per payout, 2% processing passed through to the brand.

export const PLAN_BRAND_FEE: Record<string, number> = {
  STARTER: 0.08,
  GROWTH: 0.05,
  ENTERPRISE: 0.05,
}
export const CREATOR_FEE = 0.05
export const PROCESSING_FEE = 0.02

export function fundingBreakdown(amount: number, brandFeePct: number, processingFeePct = PROCESSING_FEE) {
  const brandFee = Math.round(amount * brandFeePct)
  const processing = Math.round(amount * processingFeePct)
  return { escrow: amount, brandFee, processing, total: amount + brandFee + processing }
}

export function payoutBreakdown(amount: number, creatorFeePct = CREATOR_FEE) {
  const fee = Math.round(amount * creatorFeePct)
  return { gross: amount, fee, net: amount - fee }
}

export type MilestoneInput = { title: string; percent: number; dueDate?: string | null }

export function splitMilestones(amount: number, milestones: MilestoneInput[]) {
  const total = milestones.reduce((s, m) => s + m.percent, 0)
  if (total !== 100) throw new Error(`Milestone percentages must add up to 100 (got ${total}).`)
  let allocated = 0
  return milestones.map((m, i) => {
    const value = i === milestones.length - 1 ? amount - allocated : Math.round((amount * m.percent) / 100)
    allocated += value
    return { ...m, amount: value, order: i }
  })
}

export function defaultMilestones(mode: string): MilestoneInput[] {
  if (mode === "MILESTONES")
    return [
      { title: "Concept & script approval", percent: 30 },
      { title: "Content goes live", percent: 70 },
    ]
  return [{ title: mode === "UPFRONT" ? "Upfront payment" : "Final delivery", percent: 100 }]
}

export const UPFRONT_MIN_RELIABILITY = 85
