// Auth form schemas built from the shared contracts (same rules client + server).
import { z } from "zod"
import {
  authEmail,
  brandCompanyName,
  chooseRoleRequest,
  handle,
  loginRequest,
  password,
  registerRequest,
  type ChooseRoleRequest,
  type RegisterRequest,
} from "@hustl/contracts"

export const PASSWORD_HINT = "At least 8 characters, with a letter and a number."

export const signInSchema = loginRequest
export type SignInValues = z.infer<typeof signInSchema>

const roleField = z.enum(["BRAND", "CREATOR"], { errorMap: () => ({ message: "Choose whether you're joining as a brand or a creator." }) })
const nameField = z.string().trim().min(1, "Name is required").max(100)
const normaliseHandle = (v: string | undefined) => (v ?? "").trim().replace(/^@/, "").toLowerCase()

/** Role-specific fields: brands need a company name; a creator handle is optional (derived from the name when blank). */
function refineRoleFields(v: { role?: "BRAND" | "CREATOR"; companyName?: string; handle?: string }, ctx: z.RefinementCtx) {
  if (v.role === "BRAND") {
    const r = brandCompanyName.safeParse(v.companyName ?? "")
    if (!r.success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: r.error.issues[0]?.message ?? "Enter your company name" })
  }
  if (v.role === "CREATOR" && normaliseHandle(v.handle)) {
    const r = handle.safeParse(normaliseHandle(v.handle))
    if (!r.success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["handle"], message: r.error.issues[0]?.message ?? "Invalid handle" })
  }
}

export const signUpSchema = z
  .object({
    role: roleField,
    name: nameField,
    email: authEmail,
    password,
    companyName: z.string().optional(),
    handle: z.string().optional(),
  })
  .superRefine(refineRoleFields)
export type SignUpValues = z.infer<typeof signUpSchema>

export const onboardingSchema = z
  .object({ role: roleField, companyName: z.string().optional(), handle: z.string().optional() })
  .superRefine(refineRoleFields)
export type OnboardingValues = z.infer<typeof onboardingSchema>

export function toRegisterRequest(v: SignUpValues): RegisterRequest {
  const base = { name: v.name, email: v.email, password: v.password }
  return v.role === "BRAND"
    ? registerRequest.parse({ ...base, role: "BRAND", companyName: v.companyName })
    : registerRequest.parse({ ...base, role: "CREATOR", handle: normaliseHandle(v.handle) || undefined })
}

export function toChooseRoleRequest(v: OnboardingValues): ChooseRoleRequest {
  return v.role === "BRAND"
    ? chooseRoleRequest.parse({ role: "BRAND", companyName: v.companyName })
    : chooseRoleRequest.parse({ role: "CREATOR", handle: normaliseHandle(v.handle) || undefined })
}

/** Maps NextAuth `signIn(...).error` (our ApiError codes) to copy. */
export function signInErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "UNAUTHORIZED":
    case "CredentialsSignin":
    case "VALIDATION_ERROR":
      return "Incorrect email or password."
    case "FORBIDDEN":
      return "This account has been suspended. Contact support@hustl.app."
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a minute and try again."
    case "SERVICE_UNAVAILABLE":
    case "TIMEOUT":
    case "INTERNAL_ERROR":
      return "Service unavailable, try again in a moment."
    case "CONFLICT":
      return "This email is already linked to a different sign-in method."
    case "OAuthAccountNotLinked":
    case "GoogleSignin":
    case "OAuthCallback":
    case "OAuthSignin":
      return "Google sign-in failed. Please try again."
    default:
      return "Sign-in failed. Please try again."
  }
}
