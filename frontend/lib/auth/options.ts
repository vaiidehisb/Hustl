import "server-only"
// NextAuth v4 (JWT strategy) backed by user-service through the gateway.
// The JWT cookie holds the gateway access + refresh tokens; the session exposed
// to the browser only carries the user, role and a refresh error flag.
import type { NextAuthOptions, User } from "next-auth"
import type { JWT } from "next-auth/jwt"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { loginRequest, type AuthSession } from "@hustl/contracts"
import { authApi } from "@/lib/api/auth"
import { isApiError } from "@/lib/api/errors"
import { anonymousRequester } from "@/lib/api/gateway"
import { usersApi } from "@/lib/api/users"
import { SESSION_MAX_AGE } from "./cookie"
import { refreshAccessToken, shouldRefresh, tokenFromAuthSession, toSessionUser } from "./refresh"

const gatewayAuth = () => authApi(anonymousRequester)

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

type AuthorizedUser = User & { authSession: AuthSession }

// The Google id_token is exchanged once in `signIn` (so a failure can abort the
// sign-in) and picked up by `jwt` in the same request.
const googleExchanges = new Map<string, { session: AuthSession; at: number }>()
const takeGoogleExchange = (idToken: string) => {
  const hit = googleExchanges.get(idToken)
  googleExchanges.delete(idToken)
  for (const [k, v] of googleExchanges) if (Date.now() - v.at > 60_000) googleExchanges.delete(k)
  return hit?.session
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    id: "credentials",
    name: "Email",
    credentials: { email: { type: "email" }, password: { type: "password" } },
    async authorize(credentials) {
      const parsed = loginRequest.safeParse({ email: credentials?.email, password: credentials?.password })
      if (!parsed.success) throw new Error("VALIDATION_ERROR")
      try {
        const session = await gatewayAuth().login(parsed.data)
        const user: AuthorizedUser = { id: session.user.id, email: session.user.email, name: session.user.name, image: session.user.image, authSession: session }
        return user
      } catch (err) {
        // The error code reaches the client as `signIn(...).error`.
        throw new Error(isApiError(err) ? err.code : "SERVICE_UNAVAILABLE")
      }
    },
  }),
]

if (googleEnabled) {
  providers.push(GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }))
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/auth/signin", error: "/auth/signin" },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  callbacks: {
    async signIn({ account }) {
      if (account?.provider !== "google") return true
      if (!account.id_token) return "/auth/signin?error=GoogleSignin"
      try {
        const session = await gatewayAuth().google({ idToken: account.id_token })
        googleExchanges.set(account.id_token, { session, at: Date.now() })
        return true
      } catch (err) {
        const code = isApiError(err) ? (err.isUnavailable ? "SERVICE_UNAVAILABLE" : err.code) : "GoogleSignin"
        return `/auth/signin?error=${encodeURIComponent(code)}`
      }
    },

    async jwt({ token, user, account, trigger, session }): Promise<JWT> {
      // Initial sign-in.
      if (account && user) {
        if (account.provider === "credentials") return tokenFromAuthSession((user as AuthorizedUser).authSession)
        if (account.provider === "google" && account.id_token) {
          const exchanged = takeGoogleExchange(account.id_token) ?? (await gatewayAuth().google({ idToken: account.id_token }))
          return tokenFromAuthSession(exchanged)
        }
      }

      // Pre-gateway cookies (no access token) can't be refreshed: force a new login.
      if (!token.accessToken || !token.refreshToken) return { ...token, error: "RefreshTokenError" }
      if (token.error) return token

      if (shouldRefresh(token)) token = await refreshAccessToken(token)

      // `update({ reloadUser: true })` re-reads the user (name/image/role) from user-service.
      if (trigger === "update" && (session as { reloadUser?: boolean } | undefined)?.reloadUser && !token.error) {
        try {
          const me = await usersApi(anonymousRequester).me({ token: token.accessToken })
          token = { ...token, user: toSessionUser(me.user) }
        } catch {
          // keep the current user on transient failures
        }
      }
      return token
    },

    async session({ session, token }) {
      session.user = token.user
      session.error = token.error
      return session
    },
  },
  events: {
    async signOut({ token }) {
      if (!token?.refreshToken) return
      try {
        await gatewayAuth().logout({ refreshToken: token.refreshToken }, { token: token.accessToken || null })
      } catch {
        // Logout is best-effort; the cookie is cleared regardless.
      }
    },
  },
}
