// Pure subscription rules: periods, entitlement and product lookup.
// No I/O here so the money-adjacent logic stays unit-testable.

import { errors } from "@hustl/common"
import { planProduct, type PlanProduct, type SubscriberType, type SubscriptionInterval, type SubscriptionProductKey } from "@hustl/contracts"
import type { SubscriptionStatus } from "@hustl/db"

/** Statuses that still grant the entitlement (PAST_DUE keeps access during the provider's retry window). */
export const ENTITLED_STATUSES = ["ACTIVE", "PAST_DUE"] as const satisfies readonly SubscriptionStatus[]

export function requireProduct(key: string): PlanProduct {
  const product = planProduct(key)
  if (!product) throw errors.badRequest(`Unknown product ${key}`)
  return product
}

/** UTC period arithmetic: +1 month or +1 year from `from`. */
export function addInterval(from: Date, interval: SubscriptionInterval): Date {
  const d = new Date(from.getTime())
  if (interval === "MONTH") d.setUTCMonth(d.getUTCMonth() + 1)
  else d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

export const audienceOf = (product: SubscriptionProductKey): SubscriberType => requireProduct(product).audience

/** True while the subscriber should still get what they paid for. */
export const isEntitled = (s: { status: SubscriptionStatus; currentPeriodEnd: Date }, now = new Date()) =>
  (ENTITLED_STATUSES as readonly SubscriptionStatus[]).includes(s.status) && s.currentPeriodEnd.getTime() > now.getTime()

/** A renewal starts where the paid period ended (never leaves a gap), a first period starts now. */
export function nextPeriod(sub: { currentPeriodEnd: Date; interval: SubscriptionInterval; status: SubscriptionStatus }, now = new Date()) {
  const renewing = (ENTITLED_STATUSES as readonly SubscriptionStatus[]).includes(sub.status)
  const start = renewing && sub.currentPeriodEnd.getTime() > now.getTime() - 86_400_000 ? sub.currentPeriodEnd : now
  return { start, end: addInterval(start, sub.interval) }
}
