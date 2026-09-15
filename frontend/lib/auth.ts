import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email",
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(credentials) {
      const email = credentials?.email?.toLowerCase().trim()
      if (!email || !credentials?.password) return null
      const user = await db.user.findUnique({ where: { email } })
      if (!user?.passwordHash) return null
      const ok = await bcrypt.compare(credentials.password, user.passwordHash)
      return ok ? { id: user.id, email: user.email, name: user.name, image: user.image } : null
    },
  }),
]

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }),
  )
}

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

export const authOptions: NextAuthOptions = {
  providers,
  pages: { signIn: "/auth/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        await db.user.upsert({
          where: { email: user.email.toLowerCase() },
          update: { image: user.image ?? undefined },
          create: { email: user.email.toLowerCase(), name: user.name ?? user.email, image: user.image },
        })
      }
      return true
    },
    // Role is read from the database on every token refresh so onboarding and
    // admin changes take effect without a fresh login.
    async jwt({ token }) {
      if (!token.email) return token
      const dbUser = await db.user.findUnique({ where: { email: token.email.toLowerCase() }, select: { id: true, role: true, name: true } })
      if (dbUser) {
        token.uid = dbUser.id
        token.role = dbUser.role
        token.name = dbUser.name
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string
        session.user.role = (token.role as string | null) ?? null
      }
      return session
    },
  },
}
