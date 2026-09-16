import { NextResponse, type NextRequest } from "next/server"
import { getToken, type JWT } from "next-auth/jwt"
import { encodeSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/auth/cookie"
import { MIDDLEWARE_REFRESH_WINDOW_MS, refreshAccessToken, shouldRefresh } from "@/lib/auth/refresh"

const PORTALS = { BRAND: "/brand", CREATOR: "/creator", ADMIN: "/admin" } as const
const within = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

function redirectFor(req: NextRequest, token: JWT | null): URL | null {
  const { pathname, search } = req.nextUrl
  const inPortal = Object.values(PORTALS).some((p) => within(pathname, p))
  const inOnboarding = within(pathname, "/onboarding")
  if (!inPortal && !inOnboarding) return null

  const signin = new URL("/auth/signin", req.url)
  signin.searchParams.set("callbackUrl", pathname + search)
  if (!token?.accessToken) return signin
  if (token.error) {
    signin.searchParams.set("expired", "1")
    return signin
  }

  const role = token.user?.role
  if (!role) return inOnboarding ? null : new URL("/onboarding", req.url)
  if (inOnboarding) return new URL(PORTALS[role], req.url)
  for (const [r, prefix] of Object.entries(PORTALS)) {
    if (within(pathname, prefix) && role !== r) return new URL(PORTALS[role], req.url)
  }
  return null
}

/** Rebuilds the Cookie header with the refreshed session so server components read the new token. */
function withSessionCookie(req: NextRequest, name: string, value: string) {
  const headers = new Headers(req.headers)
  const cookies = req.cookies
    .getAll()
    .filter((c) => c.name !== name && !c.name.startsWith(`${name}.`))
    .map((c) => `${c.name}=${c.value}`)
  cookies.push(`${name}=${value}`)
  headers.set("cookie", cookies.join("; "))
  return headers
}

export async function middleware(req: NextRequest) {
  let token: JWT | null = null
  try {
    token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  } catch {
    token = null
  }

  // Refresh ahead of the jwt callback's window so server-rendered API calls
  // always see a valid token and the rotated refresh token is persisted.
  let cookieValue: string | null = null
  if (token?.accessToken && !token.error && shouldRefresh(token, MIDDLEWARE_REFRESH_WINDOW_MS)) {
    const next = await refreshAccessToken(token)
    if (next !== token) {
      token = next
      cookieValue = await encodeSessionToken(next)
    }
  }

  const name = sessionCookieName()
  const target = redirectFor(req, token)
  const res = target
    ? NextResponse.redirect(target)
    : cookieValue
      ? NextResponse.next({ request: { headers: withSessionCookie(req, name, cookieValue) } })
      : NextResponse.next()
  if (cookieValue) res.cookies.set(name, cookieValue, sessionCookieOptions())
  return res
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|api/auth|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|woff2?)$).*)"],
}
