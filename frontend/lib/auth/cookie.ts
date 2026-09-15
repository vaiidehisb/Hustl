// Session-cookie naming/encoding shared by middleware and server actions
// (mirrors next-auth v4 defaults so getToken/getServerSession read what we write).
import { encode, type JWT } from "next-auth/jwt"

export const SESSION_MAX_AGE = 30 * 24 * 60 * 60

export const useSecureCookies = () => process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL

export const sessionCookieName = () => (useSecureCookies() ? "__Secure-next-auth.session-token" : "next-auth.session-token")

export const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: useSecureCookies(),
  maxAge: SESSION_MAX_AGE,
})

export function encodeSessionToken(token: JWT) {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set")
  return encode({ token, secret, maxAge: SESSION_MAX_AGE })
}
