import { describe, expect, it } from "vitest"
import { AppError } from "@hustl/common"
import { createOfferRequest, counterOfferRequest, MAX_COUNTER_ROUNDS, splitMilestones } from "@hustl/contracts"
import { buildContractTerms, canonicalJson, hashTerms, namesMatch } from "../src/domain/contract-terms"
import { assertCanCounter, counterRoundsRemaining, feeSnapshot, fraudHold, resolveMilestones, upfrontEligibility } from "../src/domain/rules"
import { dealAllowedActions, milestoneAllowedActions } from "../src/lib/dto"

describe("milestone split", () => {
  it("splits exactly and the last milestone absorbs rounding", () => {
    const ms = splitMilestones(1001, [
      { title: "a", percent: 33 },
      { title: "b", percent: 33 },
      { title: "c", percent: 34 },
    ])
    expect(ms.map((m) => m.amount)).toEqual([330, 330, 341])
    expect(ms.reduce((s, m) => s + m.amount, 0)).toBe(1001)
    expect(ms.map((m) => m.position)).toEqual([0, 1, 2])
  })

  it("always sums to the amount", () => {
    for (const amount of [500, 777, 99_999, 1_234_567])
      for (const plan of [[50, 50], [10, 20, 70], [1, 1, 98], [33, 33, 34], [25, 25, 25, 25]]) {
        const ms = splitMilestones(amount, plan.map((percent, i) => ({ title: `m${i}`, percent })))
        expect(ms.reduce((s, m) => s + m.amount, 0)).toBe(amount)
        expect(ms.every((m) => m.amount >= 0)).toBe(true)
      }
  })

  it("rejects percentages that don't add up to 100 (server check → 422)", () => {
    expect(() => splitMilestones(1000, [{ title: "a", percent: 60 }, { title: "b", percent: 30 }])).toThrow(/add up to 100/)
    const err = (() => {
      try {
        resolveMilestones(1000, "MILESTONES", [{ title: "a", percent: 60 }, { title: "b", percent: 30 }])
      } catch (e) {
        return e as AppError
      }
    })()
    expect(err?.status).toBe(422)
  })

  it("zod refine rejects bad percentages on offers and counters", () => {
    const base = { creatorId: crypto.randomUUID(), title: "Launch", amount: 10_000, paymentMode: "MILESTONES", deliverables: "2 reels" }
    expect(createOfferRequest.safeParse({ ...base, milestones: [{ title: "Script", percent: 50 }, { title: "Live", percent: 40 }] }).success).toBe(false)
    expect(createOfferRequest.safeParse({ ...base, milestones: [{ title: "Script", percent: 50 }, { title: "Live", percent: 50 }] }).success).toBe(true)
    expect(counterOfferRequest.safeParse({ amount: 9000, milestones: [{ title: "Script", percent: 99 }] }).success).toBe(false)
  })

  it("defaults to a single 100% milestone and enforces mode shape", () => {
    expect(resolveMilestones(5000, "COMPLETION", []).map((m) => [m.percent, m.amount])).toEqual([[100, 5000]])
    expect(() => resolveMilestones(5000, "MILESTONES", [])).toThrow()
    expect(() => resolveMilestones(5000, "COMPLETION", [{ title: "a", percent: 50 }, { title: "b", percent: 50 }])).toThrow()
  })
})

describe("negotiation cap", () => {
  it(`allows ${MAX_COUNTER_ROUNDS} counter rounds and rejects the next with 409`, () => {
    expect(MAX_COUNTER_ROUNDS).toBe(2)
    expect(() => assertCanCounter(0, "OFFER_SENT")).not.toThrow()
    expect(() => assertCanCounter(1, "NEGOTIATING")).not.toThrow()
    try {
      assertCanCounter(2, "NEGOTIATING")
      throw new Error("should throw")
    } catch (e) {
      expect((e as AppError).status).toBe(409)
      expect((e as AppError).details).toMatchObject({ from: "NEGOTIATING", action: "COUNTER" })
    }
    expect(counterRoundsRemaining(0)).toBe(2)
    expect(counterRoundsRemaining(3)).toBe(0)
  })
})

describe("upfront eligibility", () => {
  it("requires reliability strictly above 85 and a KYC-verified brand", () => {
    expect(upfrontEligibility({ reliabilityScore: 86, brandKycStatus: "VERIFIED" }).eligible).toBe(true)
    expect(upfrontEligibility({ reliabilityScore: 85, brandKycStatus: "VERIFIED" }).eligible).toBe(false)
    expect(upfrontEligibility({ reliabilityScore: null, brandKycStatus: "VERIFIED" })).toEqual({ eligible: false, reasons: ["Creator has no reliability score yet"] })
    expect(upfrontEligibility({ reliabilityScore: 99, brandKycStatus: "PENDING" }).eligible).toBe(false)
    expect(upfrontEligibility({ reliabilityScore: 10, brandKycStatus: "NONE" }).reasons).toHaveLength(2)
  })
})

describe("fee snapshot and fraud hold", () => {
  it("snapshots plan-based brand fees", () => {
    expect(feeSnapshot("STARTER")).toEqual({ brandFeeRate: 0.08, creatorFeeRate: 0.05, processingFeeRate: 0.02 })
    expect(feeSnapshot("GROWTH").brandFeeRate).toBe(0.05)
    expect(feeSnapshot("ENTERPRISE").brandFeeRate).toBe(0.05)
  })

  it("holds new brands sending ≥ ₹1,00,000 for 24h", () => {
    const now = new Date("2026-09-16T10:00:00Z")
    const young = new Date(now.getTime() - 3 * 86_400_000)
    const old = new Date(now.getTime() - 8 * 86_400_000)
    expect(fraudHold({ brandUserCreatedAt: young, amount: 100_000, now })?.holdUntil.toISOString()).toBe("2026-09-17T10:00:00.000Z")
    expect(fraudHold({ brandUserCreatedAt: young, amount: 99_999, now })).toBeNull()
    expect(fraudHold({ brandUserCreatedAt: old, amount: 500_000, now })).toBeNull()
  })
})

describe("contract", () => {
  const input = {
    dealId: "d1",
    agreedOfferRound: 2,
    title: "Diwali campaign",
    deliverables: "2 reels",
    briefId: null,
    amount: 20_000,
    currency: "INR",
    paymentMode: "MILESTONES" as const,
    dueDate: new Date("2026-10-20T00:00:00Z"),
    feeRates: { brand: 0.08, creator: 0.05, processing: 0.02 },
    brand: { id: "b1", companyName: "Acme", userId: "u1", userName: "Asha Rao" },
    creator: { id: "c1", handle: "ravi", userId: "u2", userName: "Ravi K" },
    milestones: [
      { position: 1, title: "Live", percent: 70, amount: 14_000, dueDate: null },
      { position: 0, title: "Script", percent: 30, amount: 6_000, dueDate: null },
    ],
  }

  it("builds all required clauses", () => {
    const terms = buildContractTerms(input)
    expect(terms.clauses.map((c) => c.id)).toEqual(["parties", "scope", "compensation", "escrow", "disputes", "disclosure", "usage", "timeline"])
    expect(terms.disputes.windowHours).toBe(72)
    expect(terms.usageRights.days).toBe(90)
    expect(terms.disclosure.standard).toBe("ASCI")
    expect(terms.compensation.milestones.map((m) => m.position)).toEqual([0, 1])
  })

  it("hashes canonical JSON independent of key order and detects changes", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}')
    const terms = buildContractTerms(input)
    const reordered = JSON.parse(JSON.stringify(terms, Object.keys(terms).reverse()))
    expect(hashTerms(terms)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashTerms({ ...terms })).toBe(hashTerms(terms))
    expect(hashTerms({ ...reordered, ...terms })).toBe(hashTerms(terms))
    expect(hashTerms({ ...terms, compensation: { ...terms.compensation, amount: 20_001 } })).not.toBe(hashTerms(terms))
  })

  it("matches signer names case-insensitively", () => {
    expect(namesMatch("  asha   RAO ", "Asha Rao")).toBe(true)
    expect(namesMatch("Asha R", "Asha Rao")).toBe(false)
  })
})

describe("allowedActions", () => {
  const base = { status: "NEGOTIATING" as const, awaitingParty: "CREATOR" as const, negotiationRounds: 1, holdUntil: null }
  it("only the awaiting party may respond; counter disappears at the cap", () => {
    expect(dealAllowedActions(base, "CREATOR", { contract: null, reviewedByViewer: false })).toEqual(["ACCEPT", "DECLINE", "COUNTER", "CANCEL"])
    expect(dealAllowedActions(base, "BRAND", { contract: null, reviewedByViewer: false })).toEqual(["CANCEL"])
    expect(dealAllowedActions({ ...base, negotiationRounds: 2 }, "CREATOR", { contract: null, reviewedByViewer: false })).toEqual(["ACCEPT", "DECLINE", "CANCEL"])
  })
  it("sign, fund (respecting holds), dispute, review", () => {
    const contract = { brandSignedAt: new Date(), creatorSignedAt: null }
    expect(dealAllowedActions({ ...base, status: "AGREED" }, "BRAND", { contract, reviewedByViewer: false })).toEqual(["CANCEL"])
    expect(dealAllowedActions({ ...base, status: "AGREED" }, "CREATOR", { contract, reviewedByViewer: false })).toEqual(["SIGN", "CANCEL"])
    expect(dealAllowedActions({ ...base, status: "CONTRACT_SIGNED" }, "BRAND", { contract, reviewedByViewer: false })).toEqual(["FUND", "CANCEL"])
    expect(dealAllowedActions({ ...base, status: "CONTRACT_SIGNED", holdUntil: new Date(Date.now() + 3600_000) }, "BRAND", { contract, reviewedByViewer: false })).toEqual(["CANCEL"])
    expect(dealAllowedActions({ ...base, status: "IN_PROGRESS" }, "CREATOR", { contract, reviewedByViewer: false })).toEqual(["DISPUTE"])
    expect(dealAllowedActions({ ...base, status: "COMPLETED" }, "BRAND", { contract, reviewedByViewer: true })).toEqual([])
  })
  it("milestones are sequential except in UPFRONT mode", () => {
    const all = [
      { status: "SUBMITTED" as const, position: 0 },
      { status: "PENDING" as const, position: 1 },
    ]
    expect(milestoneAllowedActions({ status: "IN_PROGRESS", paymentMode: "MILESTONES" }, all[1], all, "CREATOR")).toEqual([])
    expect(milestoneAllowedActions({ status: "IN_PROGRESS", paymentMode: "UPFRONT" }, all[1], all, "CREATOR")).toEqual(["SUBMIT"])
    expect(milestoneAllowedActions({ status: "IN_PROGRESS", paymentMode: "MILESTONES" }, all[0], all, "BRAND")).toEqual(["APPROVE", "REQUEST_REVISION"])
  })
})
