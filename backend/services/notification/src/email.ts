// Transactional email via SendGrid. Optional: when SENDGRID_API_KEY / EMAIL_FROM
// are missing, email is skipped (logged once at startup). Failures never block
// in-app notifications — callers fire-and-forget through sendEmail().

import sgMail from "@sendgrid/mail"
import type { FastifyBaseLogger } from "fastify"

type Log = Pick<FastifyBaseLogger, "info" | "warn" | "error">

let configured: boolean | undefined
let logger: Log | undefined

export function initEmail(log: Log) {
  logger = log
  const key = process.env.SENDGRID_API_KEY
  const from = process.env.EMAIL_FROM
  configured = !!key && !!from
  if (configured) {
    sgMail.setApiKey(key!)
    log.info("email delivery enabled (SendGrid)")
  } else {
    const missing = [!key && "SENDGRID_API_KEY", !from && "EMAIL_FROM"].filter(Boolean)
    log.warn({ missing }, "email delivery disabled: SendGrid is not configured")
  }
  return configured
}

export const emailEnabled = () => configured === true

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export function renderEmail(input: { title: string; body: string; href: string | null; appUrl: string }) {
  const link = input.href ? `${input.appUrl.replace(/\/$/, "")}${input.href}` : input.appUrl
  const text = `${input.body}\n\nOpen hustl.: ${link}`
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f6f4;padding:24px;color:#111">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<tr><td><p style="font-weight:700;font-size:18px;margin:0 0 16px">hustl.</p>
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(input.title)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">${escapeHtml(input.body)}</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open in hustl.</a>
</td></tr></table></body></html>`
  return { subject: input.title, text, html }
}

/** Fire-and-forget; resolves false when disabled or on failure, never rejects. */
export async function sendEmail(to: string, n: { title: string; body: string; href: string | null }): Promise<boolean> {
  if (!emailEnabled()) return false
  const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000"
  try {
    const msg = renderEmail({ ...n, appUrl })
    await sgMail.send({ to, from: process.env.EMAIL_FROM!, subject: msg.subject, text: msg.text, html: msg.html })
    return true
  } catch (err) {
    logger?.error({ err: (err as Error).message }, "email delivery failed")
    return false
  }
}
