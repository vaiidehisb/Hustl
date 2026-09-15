import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

const PORTAL: Record<string, string> = { BRAND: "/brand", CREATOR: "/creator", ADMIN: "/admin" }

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | null | undefined
    const path = req.nextUrl.pathname

    if (!role && !path.startsWith("/onboarding")) return NextResponse.redirect(new URL("/onboarding", req.url))
    if (role && path.startsWith("/onboarding")) return NextResponse.redirect(new URL(PORTAL[role], req.url))

    for (const [r, prefix] of Object.entries(PORTAL)) {
      if (path.startsWith(prefix) && role !== r) return NextResponse.redirect(new URL(role ? PORTAL[role] : "/onboarding", req.url))
    }
    return NextResponse.next()
  },
  { pages: { signIn: "/auth/signin" } },
)

export const config = {
  matcher: ["/brand/:path*", "/creator/:path*", "/admin/:path*", "/onboarding", "/dashboard"],
}
