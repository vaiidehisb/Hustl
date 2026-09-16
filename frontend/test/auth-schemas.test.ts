import { describe, expect, it } from "vitest"
import { registerRequest } from "@hustl/contracts"
import { onboardingSchema, signInErrorMessage, signInSchema, signUpSchema, toChooseRoleRequest, toRegisterRequest } from "@/lib/validation/auth"

const messages = (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]))

const valid = { role: "CREATOR" as const, name: "Ana Rao", email: "  Ana@Example.COM ", password: "hunter22", companyName: "", handle: "" }

describe("signUpSchema", () => {
  it("accepts a valid creator and normalises the email", () => {
    const r = signUpSchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(r.data?.email).toBe("ana@example.com")
  })

  it("enforces the contracts password policy", () => {
    expect(messages(signUpSchema.safeParse({ ...valid, password: "short1" })).password).toMatch(/at least 8/)
    expect(messages(signUpSchema.safeParse({ ...valid, password: "longpassword" })).password).toMatch(/number/)
    expect(messages(signUpSchema.safeParse({ ...valid, password: "12345678" })).password).toMatch(/letter/)
  })

  it("requires a role and a brand company name", () => {
    expect(messages(signUpSchema.safeParse({ ...valid, role: undefined })).role).toMatch(/brand or a creator/)
    expect(messages(signUpSchema.safeParse({ ...valid, role: "BRAND", companyName: "" })).companyName).toBeTruthy()
  })

  it("validates an optional creator handle", () => {
    expect(messages(signUpSchema.safeParse({ ...valid, handle: "Bad Handle!" })).handle).toMatch(/lowercase/)
    expect(signUpSchema.safeParse({ ...valid, handle: "@ana.creates" }).success).toBe(true)
  })

  it("maps form values onto the contract request", () => {
    const creator = toRegisterRequest(signUpSchema.parse({ ...valid, handle: "@Ana.Creates" }))
    expect(creator).toEqual({ role: "CREATOR", name: "Ana Rao", email: "ana@example.com", password: "hunter22", handle: "ana.creates" })
    expect(registerRequest.safeParse(creator).success).toBe(true)

    const brand = toRegisterRequest(signUpSchema.parse({ ...valid, role: "BRAND", companyName: "Acme Co" }))
    expect(brand).toMatchObject({ role: "BRAND", companyName: "Acme Co" })
    expect(brand).not.toHaveProperty("handle")
  })
})

describe("signInSchema / onboarding", () => {
  it("requires email and password", () => {
    const m = messages(signInSchema.safeParse({ email: "nope", password: "" }))
    expect(m.email).toMatch(/valid email/)
    expect(m.password).toMatch(/required/)
  })

  it("maps onboarding values to POST /users/me/role", () => {
    expect(toChooseRoleRequest(onboardingSchema.parse({ role: "CREATOR", handle: "" }))).toEqual({ role: "CREATOR" })
    expect(onboardingSchema.safeParse({ role: "BRAND", companyName: "A" }).success).toBe(false)
  })

  it("has friendly sign-in errors", () => {
    expect(signInErrorMessage("UNAUTHORIZED")).toMatch(/incorrect/i)
    expect(signInErrorMessage("RATE_LIMITED")).toMatch(/too many/i)
    expect(signInErrorMessage("SERVICE_UNAVAILABLE")).toMatch(/service unavailable/i)
  })
})
