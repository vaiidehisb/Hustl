"use server"

import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { slugify } from "@/lib/format"
import { run, ValidationError, type ActionResult } from "@/app/actions/result"

const HANDLE_RE = /^[a-z0-9._]{3,30}$/

const roleSchema = z.enum(["BRAND", "CREATOR"])

const profileFields = {
  role: roleSchema,
  companyName: z.string().trim().max(80).optional(),
  handle: z.string().trim().max(31).optional(),
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  ...profileFields,
})

const onboardingSchema = z.object(profileFields)

export type RegisterInput = z.input<typeof registerSchema>
export type OnboardingInput = z.input<typeof onboardingSchema>

function firstIssue(err: z.ZodError) {
  return err.issues[0]?.message ?? "Please check the form and try again."
}

function normaliseHandle(raw: string | undefined) {
  const handle = (raw ?? "").trim().replace(/^@/, "").toLowerCase()
  if (!HANDLE_RE.test(handle)) throw new ValidationError("Handles are 3–30 characters: lowercase letters, numbers, dots or underscores.")
  return handle
}

async function uniqueBrandSlug(companyName: string) {
  const base = slugify(companyName) || "brand"
  let slug = base
  for (let i = 2; await db.brandProfile.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`
  return slug
}

/** Validates the role-specific part and returns the nested profile create. */
async function profileData(role: "BRAND" | "CREATOR", companyName?: string, rawHandle?: string) {
  if (role === "BRAND") {
    const name = (companyName ?? "").trim()
    if (name.length < 2) throw new ValidationError("Enter your company or brand name.")
    return { brand: { create: { companyName: name, slug: await uniqueBrandSlug(name) } } }
  }
  const handle = normaliseHandle(rawHandle)
  const taken = await db.creatorProfile.findUnique({ where: { handle }, select: { id: true } })
  if (taken) throw new ValidationError(`@${handle} is already taken. Try another handle.`)
  return { creator: { create: { handle } } }
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002"
}

export async function registerAction(input: RegisterInput): Promise<ActionResult<{ role: string }>> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { name, email, password, role, companyName, handle } = parsed.data

  return run(async () => {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new ValidationError("An account with this email already exists. Log in instead.")

    const profile = await profileData(role, companyName, handle)
    const passwordHash = await bcrypt.hash(password, 10)
    try {
      await db.user.create({ data: { name, email, passwordHash, role, ...profile } })
    } catch (err) {
      if (isUniqueViolation(err)) throw new ValidationError("That email, handle or company name was just taken. Please try again.")
      throw err
    }
    return { role }
  })
}

/** Google (or other OAuth) users arrive without a role; this sets it once. */
export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionResult<{ role: string }>> {
  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { role, companyName, handle } = parsed.data

  return run(async () => {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email?.toLowerCase()
    if (!email) throw new ValidationError("Your session expired. Please log in again.")

    const user = await db.user.findUnique({ where: { email }, include: { brand: true, creator: true } })
    if (!user) throw new ValidationError("We couldn’t find your account. Please log in again.")
    if (user.role) return { role: user.role }

    const profile = await profileData(role, companyName, handle)
    try {
      await db.user.update({
        where: { id: user.id },
        data: {
          role,
          // Skip creating a profile that somehow already exists.
          ...(role === "BRAND" && user.brand ? {} : role === "CREATOR" && user.creator ? {} : profile),
        },
      })
    } catch (err) {
      if (isUniqueViolation(err)) throw new ValidationError("That handle or company name was just taken. Please try again.")
      throw err
    }
    return { role }
  })
}
