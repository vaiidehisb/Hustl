// Contract generation: structured clauses + a canonical JSON hash of exactly
// what the parties sign.

import { createHash } from "node:crypto"
import { DISPUTE_WINDOW_HOURS, type ContractTerms, type PaymentMode } from "@hustl/contracts"

export const CONTRACT_VERSION = 1
export const USAGE_RIGHTS_DAYS = 90

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`
}

export const hashTerms = (terms: unknown) => createHash("sha256").update(canonicalJson(terms)).digest("hex")

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

export type ContractInput = {
  dealId: string
  agreedOfferRound: number
  title: string
  deliverables: string
  briefId: string | null
  amount: number
  currency: string
  paymentMode: PaymentMode
  dueDate: Date | null
  feeRates: { brand: number; creator: number; processing: number }
  brand: { id: string; companyName: string; userId: string; userName: string }
  creator: { id: string; handle: string; userId: string; userName: string }
  milestones: { position: number; title: string; percent: number; amount: number; dueDate: Date | null }[]
}

export function buildContractTerms(d: ContractInput): ContractTerms {
  const milestones = d.milestones
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ position: m.position, title: m.title, percent: m.percent, amount: m.amount, dueDate: m.dueDate?.toISOString() ?? null }))
  const dueDate = d.dueDate?.toISOString() ?? null
  const schedule = milestones.map((m) => `${m.position + 1}. ${m.title} — ${m.percent}% (${inr(m.amount)})${m.dueDate ? `, due ${day(m.dueDate)}` : ""}`).join("\n")

  const clauses = [
    {
      id: "parties",
      heading: "1. Parties",
      body: `This agreement is between ${d.brand.companyName} ("Brand"), represented by ${d.brand.userName}, and creator @${d.creator.handle} ("Creator"), ${d.creator.userName}, entered into through the hustl. marketplace.`,
    },
    {
      id: "scope",
      heading: "2. Scope of work",
      body: `Campaign: ${d.title}.\nDeliverables: ${d.deliverables}`,
    },
    {
      id: "compensation",
      heading: "3. Compensation",
      body: `Total fee ${inr(d.amount)} (${d.currency}), payment mode ${d.paymentMode}, paid per milestone:\n${schedule}\nhustl. deducts a ${Math.round(d.feeRates.creator * 100)}% creator fee from each payout. The Brand pays a ${Math.round(d.feeRates.brand * 100)}% platform fee and ${Math.round(d.feeRates.processing * 100)}% payment processing at funding.`,
    },
    {
      id: "escrow",
      heading: "4. Escrow",
      body: "The Brand funds the full fee into escrow before work begins. Each milestone amount is released to the Creator when the Brand approves the submitted deliverable. Escrowed funds cannot be withdrawn by the Brand while a milestone is in progress except through dispute resolution.",
    },
    {
      id: "disputes",
      heading: "5. Disputes",
      body: `Either party may raise a dispute within ${DISPUTE_WINDOW_HOURS} hours of the latest submission for a milestone. Escrow is frozen while a dispute is open and hustl. decides whether to release funds to the Creator, refund the Brand, or split the amount.`,
    },
    {
      id: "disclosure",
      heading: "6. Advertising disclosure",
      body: "All sponsored content must carry a clear, prominent disclosure (e.g. #ad, #sponsored or a platform paid-partnership label) in line with the ASCI Guidelines for Influencer Advertising in Digital Media.",
    },
    {
      id: "usage",
      heading: "7. Usage rights",
      body: `The Brand may reuse the delivered content on its owned channels for ${USAGE_RIGHTS_DAYS} days from publication. Paid amplification or use beyond ${USAGE_RIGHTS_DAYS} days requires a separate written agreement. The Creator retains ownership of the content.`,
    },
    {
      id: "timeline",
      heading: "8. Timeline",
      body: dueDate ? `Final deliverables are due by ${day(dueDate)}. Milestone due dates are listed in clause 3.` : "Deliverables are due on the milestone dates listed in clause 3, or as agreed in writing through hustl.",
    },
  ]

  return {
    version: CONTRACT_VERSION,
    dealId: d.dealId,
    agreedOfferRound: d.agreedOfferRound,
    parties: {
      brand: { brandId: d.brand.id, companyName: d.brand.companyName, signatoryUserId: d.brand.userId, signatoryName: d.brand.userName },
      creator: { creatorId: d.creator.id, handle: d.creator.handle, signatoryUserId: d.creator.userId, signatoryName: d.creator.userName },
    },
    scope: { title: d.title, deliverables: d.deliverables, briefId: d.briefId },
    compensation: { currency: d.currency, amount: d.amount, paymentMode: d.paymentMode, feeRates: d.feeRates, milestones },
    escrow: { fundedBeforeWork: true, releaseTrigger: "BRAND_APPROVAL" },
    disputes: { windowHours: DISPUTE_WINDOW_HOURS },
    disclosure: { standard: "ASCI", required: true },
    usageRights: { days: USAGE_RIGHTS_DAYS },
    timeline: { dueDate },
    clauses,
  }
}

export const namesMatch = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase()
