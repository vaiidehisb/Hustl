// HMAC-signed, short-lived download links for the local storage driver.

import { createHmac, timingSafeEqual } from "node:crypto"

export const DOWNLOAD_TTL_SECONDS = 5 * 60
export const UPLOAD_TTL_SECONDS = 10 * 60

function secret() {
  const s = process.env.INTERNAL_SERVICE_TOKEN
  if (!s) throw new Error("INTERNAL_SERVICE_TOKEN is not set")
  return s
}

export const signFile = (id: string, exp: number) => createHmac("sha256", secret()).update(`media-file:${id}:${exp}`).digest("base64url")

export type SignatureCheck = "ok" | "expired" | "invalid"

export function verifyFileSignature(id: string, exp: number, sig: string, nowSeconds = Math.floor(Date.now() / 1000)): SignatureCheck {
  const expected = Buffer.from(signFile(id, exp))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid"
  return exp < nowSeconds ? "expired" : "ok"
}

/** API paths are relative (called through the gateway) unless MEDIA_PUBLIC_BASE_URL is set. */
export const publicUrl = (path: string) => `${(process.env.MEDIA_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}${path}`
