// Client-safe mirror of `portalHome` in lib/session.ts (which is server-only).
export const portalPath = (role: string | null | undefined) =>
  role === "BRAND" ? "/brand" : role === "CREATOR" ? "/creator" : role === "ADMIN" ? "/admin" : "/onboarding"

export const brandMark = "/logo-mark.jpg"
