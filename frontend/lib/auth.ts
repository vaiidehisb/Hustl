// Back-compat entry point. New code should import from "@/lib/auth/options" or "@/lib/auth/session".
export { authOptions, googleEnabled } from "./auth/options"
export { getAccessToken, getSession, getSessionUser, portalHome, requireRole, requireUser, type SessionUser } from "./auth/session"
