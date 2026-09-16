import type { SessionUser } from "@/lib/auth/refresh"

declare module "next-auth" {
  interface Session {
    user: SessionUser
    /** Set when the refresh token was rejected: the user must sign in again. */
    error?: "RefreshTokenError"
  }
}

declare module "next-auth/jwt" {
  /** Lives only in the encrypted httpOnly cookie. Never serialised into the Session. */
  interface JWT {
    user: SessionUser
    accessToken: string
    /** Epoch milliseconds. */
    accessTokenExpiresAt: number
    refreshToken: string
    error?: "RefreshTokenError"
  }
}
