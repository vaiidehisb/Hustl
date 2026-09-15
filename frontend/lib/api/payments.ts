import type { CreateIntentResponse, DealEscrowSummary, LedgerEntry, PaymentIntent, PaymentsSummary, Payout, PayoutAccount, PayoutOnboardingLink } from "./types"
import { seg, type CallOptions, type Requester } from "./core"

export const paymentsApi = (r: Requester) => ({
  /** POST /payments/deals/:dealId/intent (brand; deal must be CONTRACT_SIGNED). Idempotent. */
  createIntent: (dealId: string, o?: CallOptions) => r<CreateIntentResponse>(`/payments/deals/${seg(dealId)}/intent`, { ...o, method: "POST" }),
  /** POST /payments/intents/:id/confirm-test — test provider only. */
  confirmTest: (intentId: string, o?: CallOptions) => r<PaymentIntent>(`/payments/intents/${seg(intentId)}/confirm-test`, { ...o, method: "POST" }),
  /** GET /payments/deals/:dealId — escrow summary + ledger + payouts. */
  forDeal: (dealId: string, o?: CallOptions) => r<DealEscrowSummary>(`/payments/deals/${seg(dealId)}`, o),
  /** GET /payments/me/ledger (brand) */
  myLedger: (query?: { page?: number }, o?: CallOptions) => r.withMeta<LedgerEntry[]>("/payments/me/ledger", { ...o, query }),
  /** GET /payments/me/payouts (creator) */
  myPayouts: (query?: { page?: number }, o?: CallOptions) => r.withMeta<Payout[]>("/payments/me/payouts", { ...o, query }),
  /** GET /payments/me/summary */
  mySummary: (o?: CallOptions) => r<PaymentsSummary>("/payments/me/summary", o),
  /** GET /payments/payout-account */
  payoutAccount: (o?: CallOptions) => r<PayoutAccount>("/payments/payout-account", o),
  /** POST /payments/payout-account/onboarding-link — 503 without provider creds. */
  payoutOnboardingLink: (body?: { returnUrl?: string; refreshUrl?: string }, o?: CallOptions) =>
    r<PayoutOnboardingLink>("/payments/payout-account/onboarding-link", { ...o, method: "POST", body }),
})
