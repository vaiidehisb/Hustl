// BFF proxy for client components / React Query: /api/gateway/* → API Gateway.
// The session access token is attached here, server-side. /internal and /ai are blocked.
import type { NextRequest } from "next/server"
import { gatewayUrl } from "@/lib/api/gateway"
import { createGatewayProxy } from "@/lib/api/proxy"
import { getAccessToken } from "@/lib/auth/token"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const proxy = createGatewayProxy({
  get baseUrl() {
    return gatewayUrl()
  },
  getToken: getAccessToken,
})

type Ctx = { params: Promise<{ path: string[] }> }

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
