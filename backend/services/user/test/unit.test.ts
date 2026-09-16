import { describe, expect, it } from "vitest"
import { handle as handleSchema } from "@hustl/contracts"
import { brandSlugBase, creatorHandleBase, nextFreeSlug, slugify } from "../src/lib/slug"
import { brandCompletion, creatorCompletion } from "../src/services/profile-completion"

describe("slugs", () => {
  it("folds accents and punctuation", () => {
    expect(slugify("  Café Délice & Co. ", "-", 60)).toBe("cafe-delice-co")
    expect(brandSlugBase("Mamaearth Pvt. Ltd.")).toBe("mamaearth-pvt-ltd")
    expect(brandSlugBase("!!!")).toBe("brand")
  })

  it("adds a numeric suffix on collision", () => {
    expect(nextFreeSlug("acme", [], "-")).toBe("acme")
    expect(nextFreeSlug("acme", ["acme", "acme-2"], "-")).toBe("acme-3")
    expect(nextFreeSlug("riya", ["riya"], "_")).toBe("riya_2")
  })

  it("derives creator handles that satisfy the handle rule", () => {
    for (const [name, email] of [
      ["Riya Sharma", "riya@x.com"],
      ["李", "zz@x.com"],
      ["", "a@x.com"],
      ["A very very long creator name that keeps going", "x@y.com"],
    ] as const) {
      const base = creatorHandleBase(name, email)
      expect(handleSchema.safeParse(base).success, base).toBe(true)
      expect(handleSchema.safeParse(`${base}_99`).success).toBe(true)
    }
  })
})

describe("profile completion", () => {
  const emptyCreator = { headline: "", bio: " ", location: "", niches: [], rateCard: [], portfolio: [], avatarUrl: null }

  it("counts creator fields including a connected social account", () => {
    expect(creatorCompletion(emptyCreator, 0)).toEqual({
      percent: 0,
      missing: ["headline", "bio", "location", "niches", "rateCard", "portfolio", "avatar", "socialAccount"],
    })
    const full = { headline: "h", bio: "b", location: "Mumbai", niches: ["tech"], rateCard: [{ deliverable: "Reel", price: 1 }], portfolio: [{ title: "t", url: "https://x.y" }], avatarUrl: "https://a.b/c.png" }
    expect(creatorCompletion(full, 0)).toEqual({ percent: 88, missing: ["socialAccount"] })
    expect(creatorCompletion(full, 2)).toEqual({ percent: 100, missing: [] })
  })

  it("counts brand fields", () => {
    expect(brandCompletion({ companyName: "Acme", logoUrl: null, website: "", industry: "Beauty", description: "", location: "" })).toEqual({
      percent: 33,
      missing: ["logo", "website", "description", "location"],
    })
  })
})
