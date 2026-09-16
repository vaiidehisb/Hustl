import type {
  AdminGrantSubscriptionRequest,
  BillingProductsResponse,
  BillingSubscriptionResponse,
  CancelSubscriptionResponse,
  ConfirmTestSubscriptionResponse,
  SubscribeResponse,
  SubscriptionDTO,
  SubscriptionProductKey,
} from "@hustl/contracts"
import { seg, type CallOptions, type Requester } from "./core"

/** Subscriptions: the brand Growth plan and the paid Verified Creator badge. */
export const billingApi = (r: Requester) => ({
  /** GET /payments/billing/products — catalogue for the caller's audience, with what they already own. */
  products: (o?: CallOptions) => r<BillingProductsResponse>("/payments/billing/products", o),
  /** GET /payments/billing/subscription — the caller's subscriptions, invoices and current entitlements. */
  mine: (o?: CallOptions) => r<BillingSubscriptionResponse>("/payments/billing/subscription", o),
  /** POST /payments/billing/subscribe — 409 if already active, 503 without provider credentials. */
  subscribe: (product: SubscriptionProductKey, o?: CallOptions) =>
    r<SubscribeResponse>("/payments/billing/subscribe", { ...o, method: "POST", body: { product } }),
  /** POST /payments/billing/subscriptions/:id/cancel — keeps access until the period ends. */
  cancel: (id: string, o?: CallOptions) => r<CancelSubscriptionResponse>(`/payments/billing/subscriptions/${seg(id)}/cancel`, { ...o, method: "POST" }),
  /** POST /payments/billing/subscriptions/:id/confirm-test — test provider only. */
  confirmTest: (id: string, o?: CallOptions) =>
    r<ConfirmTestSubscriptionResponse>(`/payments/billing/subscriptions/${seg(id)}/confirm-test`, { ...o, method: "POST" }),
  /** GET /admin/billing/subscriptions */
  adminList: (query?: { status?: string; page?: number }, o?: CallOptions) => r.withMeta<SubscriptionDTO[]>("/admin/billing/subscriptions", { ...o, query }),
  /** POST /admin/billing/subscriptions — grant Enterprise or a comp. */
  adminGrant: (body: AdminGrantSubscriptionRequest, o?: CallOptions) => r<SubscriptionDTO>("/admin/billing/subscriptions", { ...o, method: "POST", body }),
})
