import { describe, expect, it } from "vitest"
import { AppError } from "@hustl/common"
import { DEAL_ACTIONS, DEAL_STATUSES, MILESTONE_ACTIONS, MILESTONE_STATUSES, type DealAction, type DealStatus, type MilestoneAction, type MilestoneStatus } from "@hustl/contracts"
import { assertMilestoneTransition, assertTransition, canTransition, machineActions, type Actor } from "../src/domain/deal-machine"

const ACTORS: Actor[] = ["BRAND", "CREATOR", "ADMIN", "SYSTEM"]
const P: Actor[] = ["BRAND", "CREATOR"]

/** The complete set of valid deal transitions (independent of the implementation table). */
const VALID: [DealStatus, DealAction, Actor[], DealStatus][] = [
  ["OFFER_SENT", "COUNTER", P, "NEGOTIATING"],
  ["OFFER_SENT", "ACCEPT", P, "AGREED"],
  ["OFFER_SENT", "DECLINE", P, "CANCELLED"],
  ["OFFER_SENT", "CANCEL", [...P, "ADMIN"], "CANCELLED"],
  ["NEGOTIATING", "COUNTER", P, "NEGOTIATING"],
  ["NEGOTIATING", "ACCEPT", P, "AGREED"],
  ["NEGOTIATING", "DECLINE", P, "CANCELLED"],
  ["NEGOTIATING", "CANCEL", [...P, "ADMIN"], "CANCELLED"],
  ["AGREED", "SIGN", P, "CONTRACT_SIGNED"],
  ["AGREED", "CANCEL", [...P, "ADMIN"], "CANCELLED"],
  ["CONTRACT_SIGNED", "FUND", ["SYSTEM"], "FUNDED"],
  ["CONTRACT_SIGNED", "CANCEL", [...P, "ADMIN"], "CANCELLED"],
  ["FUNDED", "START", ["SYSTEM"], "IN_PROGRESS"],
  ["FUNDED", "DISPUTE", P, "DISPUTED"],
  ["IN_PROGRESS", "COMPLETE", ["SYSTEM"], "COMPLETED"],
  ["IN_PROGRESS", "DISPUTE", P, "DISPUTED"],
  ["IN_PROGRESS", "CANCEL", ["SYSTEM"], "CANCELLED"],
  ["DISPUTED", "RESOLVE", ["SYSTEM", "ADMIN"], "IN_PROGRESS"],
  ["DISPUTED", "COMPLETE", ["SYSTEM"], "COMPLETED"],
  ["DISPUTED", "CANCEL", ["SYSTEM"], "CANCELLED"],
]

function catchErr(fn: () => unknown): AppError {
  try {
    fn()
  } catch (e) {
    return e as AppError
  }
  throw new Error("expected throw")
}

describe("deal state machine", () => {
  it.each(VALID.flatMap(([from, action, by, to]) => by.map((actor) => [from, action, actor, to] as const)))("%s --%s(%s)--> %s", (from, action, actor, to) => {
    expect(assertTransition(from, action, actor)).toBe(to)
    expect(canTransition(from, action, actor)).toBe(true)
  })

  it("rejects every other (state, action) pair with 409 CONFLICT {from, action}", () => {
    let checked = 0
    for (const from of DEAL_STATUSES)
      for (const action of DEAL_ACTIONS) {
        if (VALID.some(([f, a]) => f === from && a === action)) continue
        for (const actor of ACTORS) {
          const err = catchErr(() => assertTransition(from, action, actor))
          expect(err).toBeInstanceOf(AppError)
          expect(err.status).toBe(409)
          expect(err.code).toBe("CONFLICT")
          expect(err.details).toEqual({ from, action })
          checked++
        }
      }
    expect(checked).toBeGreaterThan(250)
  })

  it("rejects valid transitions for disallowed actors with 403", () => {
    for (const [from, action, by] of VALID)
      for (const actor of ACTORS.filter((a) => !by.includes(a))) {
        const err = catchErr(() => assertTransition(from, action, actor))
        expect(err.status).toBe(403)
        expect(canTransition(from, action, actor)).toBe(false)
      }
  })

  it("terminal states allow nothing", () => {
    for (const actor of ACTORS) {
      expect(machineActions("COMPLETED", actor)).toEqual([])
      expect(machineActions("CANCELLED", actor)).toEqual([])
    }
  })

  it("parties cannot fund, start or complete deals directly", () => {
    expect(machineActions("CONTRACT_SIGNED", "BRAND")).toEqual(["CANCEL"])
    expect(machineActions("IN_PROGRESS", "BRAND")).toEqual(["DISPUTE"])
  })
})

const M_VALID: [MilestoneStatus, MilestoneAction, Actor[], MilestoneStatus][] = [
  ["PENDING", "SUBMIT", ["CREATOR"], "SUBMITTED"],
  ["PENDING", "DISPUTE", P, "DISPUTED"],
  ["PENDING", "REFUND", ["SYSTEM"], "REFUNDED"],
  ["SUBMITTED", "APPROVE", ["BRAND"], "APPROVED"],
  ["SUBMITTED", "REQUEST_REVISION", ["BRAND"], "REVISION_REQUESTED"],
  ["SUBMITTED", "DISPUTE", P, "DISPUTED"],
  ["SUBMITTED", "REFUND", ["SYSTEM"], "REFUNDED"],
  ["REVISION_REQUESTED", "SUBMIT", ["CREATOR"], "SUBMITTED"],
  ["REVISION_REQUESTED", "DISPUTE", P, "DISPUTED"],
  ["REVISION_REQUESTED", "REFUND", ["SYSTEM"], "REFUNDED"],
  ["APPROVED", "RELEASE", ["SYSTEM"], "RELEASED"],
  ["APPROVED", "DISPUTE", P, "DISPUTED"],
  ["APPROVED", "REFUND", ["SYSTEM"], "REFUNDED"],
  ["DISPUTED", "RELEASE", ["SYSTEM"], "RELEASED"],
  ["DISPUTED", "REFUND", ["SYSTEM"], "REFUNDED"],
]

describe("milestone state machine", () => {
  it.each(M_VALID.flatMap(([from, action, by, to]) => by.map((actor) => [from, action, actor, to] as const)))("%s --%s(%s)--> %s", (from, action, actor, to) => {
    expect(assertMilestoneTransition(from, action, actor)).toBe(to)
  })

  it("rejects all other transitions (409) and wrong actors (403)", () => {
    for (const from of MILESTONE_STATUSES)
      for (const action of MILESTONE_ACTIONS) {
        const valid = M_VALID.find(([f, a]) => f === from && a === action)
        for (const actor of ACTORS) {
          if (valid?.[2].includes(actor)) continue
          const err = catchErr(() => assertMilestoneTransition(from, action, actor))
          expect(err.status).toBe(valid ? 403 : 409)
          if (!valid) expect(err.details).toEqual({ from, action })
        }
      }
  })

  it("brand cannot submit and creator cannot approve", () => {
    expect(catchErr(() => assertMilestoneTransition("PENDING", "SUBMIT", "BRAND")).status).toBe(403)
    expect(catchErr(() => assertMilestoneTransition("SUBMITTED", "APPROVE", "CREATOR")).status).toBe(403)
  })
})
