import { describe, expect, it } from "vitest"
import * as t from "../src/templates"

const deal = { id: "d1", title: "Launch reel", brandName: "Acme", creatorName: "Riya" }

describe("notification templates", () => {
  it("application submitted → brand, brief link", () => {
    const [n, ...rest] = t.applicationSubmitted({ briefId: "b1", briefTitle: "Summer", creatorName: "Riya" })
    expect(rest).toHaveLength(0)
    expect(n).toMatchObject({ audience: "brand", href: "/brand/briefs/b1" })
    expect(n!.body).toContain("Riya")
  })

  it("application status → creator applications; silent for withdrawn", () => {
    expect(t.applicationStatusChanged({ status: "SHORTLISTED", briefTitle: "S", brandName: "Acme" })[0]).toMatchObject({ audience: "creator", href: "/creator/applications", title: "You've been shortlisted" })
    expect(t.applicationStatusChanged({ status: "REJECTED", briefTitle: "S", brandName: "Acme" })).toHaveLength(1)
    expect(t.applicationStatusChanged({ status: "WITHDRAWN", briefTitle: "S", brandName: "Acme" })).toHaveLength(0)
  })

  it("offer sent → creator deal link with amount and email", () => {
    const [n] = t.offerSent({ ...deal, amount: 150000 })
    expect(n).toMatchObject({ audience: "creator", href: "/creator/deals/d1", email: true })
    expect(n!.body).toContain("₹1,50,000")
  })

  it("counter / accept / decline go to the other party", () => {
    expect(t.offerCountered({ ...deal, counteredBy: "creator", amount: 1000 })[0]).toMatchObject({ audience: "brand", href: "/brand/deals/d1" })
    expect(t.offerAccepted({ ...deal, acceptedBy: "creator" })[0]).toMatchObject({ audience: "brand" })
    expect(t.offerDeclined({ ...deal, declinedBy: "brand" })[0]).toMatchObject({ audience: "creator", href: "/creator/deals/d1" })
  })

  it("contract signed: pending signer gets 'ready to sign', fully signed notifies both", () => {
    const pending = t.contractSigned({ ...deal, pending: ["creator"] })
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ audience: "creator", title: "Contract ready to sign", email: true })
    expect(t.contractSigned({ ...deal, pending: [] }).map((n) => n.audience).sort()).toEqual(["brand", "creator"])
  })

  it("deal funded notifies both, emails the creator", () => {
    const ns = t.dealFunded({ ...deal, amount: 20000 })
    expect(ns.find((n) => n.audience === "creator")).toMatchObject({ email: true, href: "/creator/deals/d1" })
    expect(ns.find((n) => n.audience === "brand")?.email).toBeFalsy()
  })

  it("milestone events", () => {
    expect(t.milestoneSubmitted({ ...deal, milestoneTitle: "Draft" })[0]).toMatchObject({ audience: "brand", href: "/brand/deals/d1", email: true })
    expect(t.milestoneApproved({ ...deal, milestoneTitle: null })[0]).toMatchObject({ audience: "creator" })
    const rev = t.milestoneRevisionRequested({ ...deal, milestoneTitle: "Draft", note: "Brighter lighting" })[0]!
    expect(rev.audience).toBe("creator")
    expect(rev.body).toContain("Brighter lighting")
  })

  it("payment released → creator earnings with net amount when known", () => {
    const [n] = t.paymentReleased({ ...deal, net: 18000, milestoneTitle: null })
    expect(n).toMatchObject({ audience: "creator", href: "/creator/earnings", email: true })
    expect(n!.body).toContain("₹18,000")
    expect(t.paymentReleased({ ...deal, net: null, milestoneTitle: null })[0]!.body).not.toContain("₹")
  })

  it("completed / cancelled notify both parties", () => {
    expect(t.dealCompleted(deal).map((n) => n.href)).toEqual(["/brand/deals/d1", "/creator/deals/d1"])
    expect(t.dealCancelled(deal)).toHaveLength(2)
  })

  it("disputes notify both parties and admins", () => {
    const opened = t.disputeOpened({ ...deal, raisedBy: "brand", reason: "Late" })
    expect(opened.map((n) => n.audience)).toEqual(["brand", "creator", "admin"])
    expect(opened.find((n) => n.audience === "admin")!.href).toBe("/admin")
    expect(opened.find((n) => n.audience === "brand")!.body).toMatch(/^You opened/)
    const resolved = t.disputeResolved({ ...deal, resolution: "SPLIT", splitCreatorPercent: 60 })
    expect(resolved).toHaveLength(3)
    expect(resolved[0]!.body).toContain("60% to the creator")
  })

  it("fraud → admins; kyc → own settings", () => {
    expect(t.fraudFlagged({ label: "Follower spike", severity: "HIGH", subject: "CREATOR", subjectName: "@x" })[0]).toMatchObject({ audience: "admin", href: "/admin" })
    expect(t.kycVerified({ role: "creator" })[0]).toMatchObject({ audience: "creator", href: "/creator/settings" })
    expect(t.kycVerified({ role: null })).toHaveLength(0)
  })
})
