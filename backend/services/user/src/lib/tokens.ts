import { createHash, randomBytes } from "node:crypto"
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken, type Role } from "@hustl/common"
import { REFRESH_TOKEN_BYTES } from "../config"

/** Opaque refresh token handed to the client; only its sha256 is stored. */
export const generateRefreshToken = () => randomBytes(REFRESH_TOKEN_BYTES).toString("base64url")

export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex")

export function accessTokenFor(user: { id: string; email: string; role: Role | null }) {
  return {
    accessToken: signAccessToken({ id: user.id, email: user.email, role: user.role }),
    accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
  }
}
