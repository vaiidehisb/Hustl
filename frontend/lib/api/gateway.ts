// Gateway location + an anonymous requester. Free of session imports so auth
// code (next-auth callbacks, middleware) can call the gateway without cycles.
import { createRequester } from "./core"

export const gatewayUrl = () => process.env.API_GATEWAY_URL || "http://localhost:4000"

/** Requester that never attaches a session token (auth endpoints, refresh, logout). */
export const anonymousRequester = createRequester({
  get baseUrl() {
    return gatewayUrl()
  },
  getToken: async () => null,
})
