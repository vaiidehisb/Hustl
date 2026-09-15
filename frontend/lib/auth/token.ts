import "server-only"
// Server-side access to the NextAuth JWT (which holds the gateway tokens).
// Middleware refreshes it before rendering, so reads here are decode-only.
import { cookies, headers } from "next/headers"
import { getToken, type JWT } from "next-auth/jwt"
import { encodeSessionToken, sessionCookieName, sessionCookieOptions } from "./cookie"

export async function readSessionToken(): Promise<JWT | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const req = {
    cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])),
    headers: Object.fromEntries(headerStore.entries()),
  }
  return getToken({ req: req as unknown as Parameters<typeof getToken>[0]["req"], secret: process.env.NEXTAUTH_SECRET })
}

/** The gateway access token for the current request, or null (anonymous / expired session). */
export async function getAccessToken(): Promise<string | null> {
  try {
    const token = await readSessionToken()
    if (!token || token.error || !token.accessToken) return null
    return token.accessToken
  } catch {
    // Outside a request scope (e.g. build-time static generation).
    return null
  }
}

/** Persist an updated JWT (server actions / route handlers only). */
export async function writeSessionToken(token: JWT) {
  const cookieStore = await cookies()
  cookieStore.set(sessionCookieName(), await encodeSessionToken(token), sessionCookieOptions())
}
