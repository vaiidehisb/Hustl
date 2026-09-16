"use server"

// Subscription billing: the brand Growth plan and the paid Verified Creator
// badge. Entitlements are applied by the backend from provider events, so
// these actions only start, confirm or cancel a subscription.

import { revalidatePath } from "next/cache"
import type { SubscriptionProductKey } from "@hustl/contracts"
import { billing } from "@/lib/api"
import { toFormError } from "@/lib/api/form-errors"

export type ActionError = { code: string; message: string }
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError }

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof Error && /NEXT_REDIRECT|NEXT_NOT_FOUND/.test(err.message)) throw err
    const e = toFormError(err)
    return { ok: false, error: { code: e.code, message: e.error } }
  }
}

function refresh() {
  revalidatePath("/brand/settings")
  revalidatePath("/brand", "layout")
  revalidatePath("/creator/settings")
  revalidatePath("/creator", "layout")
}

/** Starts a subscription. In test mode the response carries a confirm path; real providers return checkout details. */
export async function subscribeAction(product: SubscriptionProductKey) {
  return run(async () => {
    const res = await billing.subscribe(product)
    refresh()
    return res
  })
}

/** Test provider only — runs the same code path a provider webhook would. */
export async function confirmTestSubscriptionAction(subscriptionId: string) {
  return run(async () => {
    const res = await billing.confirmTest(subscriptionId)
    refresh()
    return res
  })
}

/** Cancels at period end; access continues until `accessUntil`. */
export async function cancelSubscriptionAction(subscriptionId: string) {
  return run(async () => {
    const res = await billing.cancel(subscriptionId)
    refresh()
    return res
  })
}
