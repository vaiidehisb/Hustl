// Hands the Socket.io client the current access token. Same-origin, session-bound, never cached.
import { readSessionToken } from "@/lib/auth/token"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const fail = (status: number, code: string, message: string) =>
  Response.json({ success: false, error: { code, message } }, { status, headers: { "cache-control": "no-store, private" } })

export async function GET(req: Request) {
  const site = req.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return fail(403, "FORBIDDEN", "Cross-site requests are not allowed")

  const token = await readSessionToken().catch(() => null)
  if (!token?.accessToken || token.error) return fail(401, "UNAUTHORIZED", "Authentication required")
  if (token.accessTokenExpiresAt && token.accessTokenExpiresAt <= Date.now()) return fail(401, "UNAUTHORIZED", "Session expired")

  return Response.json(
    { success: true, data: { token: token.accessToken, expiresAt: new Date(token.accessTokenExpiresAt).toISOString() } },
    { headers: { "cache-control": "no-store, private" } },
  )
}
