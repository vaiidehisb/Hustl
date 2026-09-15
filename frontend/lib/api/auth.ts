import type { AuthSession, GoogleAuthRequest, LoginRequest, LogoutResponse, RefreshRequest, RegisterRequest } from "@hustl/contracts"
import type { GoogleAuthResponse } from "./types"
import type { CallOptions, Requester } from "./core"

// Auth endpoints are always anonymous (token: null) unless a token is given explicitly.
export const authApi = (r: Requester) => ({
  /** POST /auth/register — 409 on duplicate email/handle, 422 on invalid fields. */
  register: (body: RegisterRequest, o?: CallOptions) => r<AuthSession>("/auth/register", { token: null, ...o, method: "POST", body }),
  /** POST /auth/login — 401 bad credentials, 403 suspended. */
  login: (body: LoginRequest, o?: CallOptions) => r<AuthSession>("/auth/login", { token: null, ...o, method: "POST", body }),
  /** POST /auth/refresh — rotates the refresh token. */
  refresh: (body: RefreshRequest, o?: CallOptions) => r<AuthSession>("/auth/refresh", { token: null, ...o, method: "POST", body }),
  /** POST /auth/logout */
  logout: (body: RefreshRequest, o?: CallOptions) => r<LogoutResponse>("/auth/logout", { token: null, ...o, method: "POST", body }),
  /** POST /auth/google — exchanges a Google id_token. */
  google: (body: GoogleAuthRequest, o?: CallOptions) => r<GoogleAuthResponse>("/auth/google", { token: null, ...o, method: "POST", body }),
})
