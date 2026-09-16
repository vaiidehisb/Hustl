// Bootstrap an admin account (admins can't self-register).
//   npm run admin:create -- --email ops@hustl.app --name "Hustl Ops"
// Password comes from ADMIN_PASSWORD, or a strong one is generated and printed once.
// Re-running for an existing email promotes that user to ADMIN and resets the password.

import { randomBytes } from "node:crypto"
import { parseArgs } from "node:util"
import { prisma } from "@hustl/db"
import { password as passwordSchema } from "@hustl/contracts"
import { hashPassword, revokeAllRefreshTokens } from "../src/services/auth.service"

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } })
  const email = values.email?.trim().toLowerCase()
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('Usage: npm run admin:create -- --email you@company.com [--name "Full Name"]')
    process.exit(1)
  }

  const generated = !process.env.ADMIN_PASSWORD
  const password = process.env.ADMIN_PASSWORD ?? `${randomBytes(12).toString("base64url")}9a`
  const check = passwordSchema.safeParse(password)
  if (!check.success) {
    console.error(`ADMIN_PASSWORD rejected: ${check.error.issues.map((i) => i.message).join("; ")}`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash, status: "ACTIVE" },
    create: { email, name: values.name ?? "hustl. Admin", role: "ADMIN", passwordHash, kycStatus: "VERIFIED" },
  })
  await revokeAllRefreshTokens(user.id)
  console.log(`Admin ready: ${user.email} (${user.id})`)
  if (generated) console.log(`Generated password (shown once): ${password}`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
