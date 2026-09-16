import type { Dispute, EscrowAccount, LedgerEntry, PaymentIntent, Payout, PayoutAccount, Subscription, SubscriptionInvoice } from "@hustl/db"
import {
  fundingBreakdown,
  planProduct,
  type DisputeDTO,
  type EscrowSummary,
  type LedgerEntryDTO,
  type PaymentIntentDTO,
  type PaymentMode,
  type PayoutAccountDTO,
  type PayoutDTO,
  type SubscriptionDTO,
  type SubscriptionInvoiceDTO,
  type SubscriptionProductKey,
} from "@hustl/contracts"
import { isEntitled } from "../domain/billing"

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export const toIntentDTO = (i: PaymentIntent): PaymentIntentDTO => ({
  id: i.id,
  dealId: i.dealId,
  provider: i.provider,
  status: i.status,
  escrowAmount: i.escrowAmount,
  brandFee: i.brandFee,
  processingFee: i.processingFee,
  totalAmount: i.totalAmount,
  currency: i.currency,
  failureReason: i.failureReason,
  createdAt: i.createdAt.toISOString(),
  updatedAt: i.updatedAt.toISOString(),
})

export const toLedgerDTO = (l: LedgerEntry & { deal?: { title: string } }): LedgerEntryDTO => ({
  id: l.id,
  dealId: l.dealId,
  ...(l.deal && { dealTitle: l.deal.title }),
  milestoneId: l.milestoneId,
  type: l.type,
  amount: l.amount,
  provider: l.provider,
  providerRef: l.providerRef,
  createdAt: l.createdAt.toISOString(),
})

export const toPayoutDTO = (p: Payout & { deal?: { title: string }; milestone?: { title: string } }): PayoutDTO => ({
  id: p.id,
  dealId: p.dealId,
  ...(p.deal && { dealTitle: p.deal.title }),
  milestoneId: p.milestoneId,
  ...(p.milestone && { milestoneTitle: p.milestone.title }),
  creatorId: p.creatorId,
  gross: p.gross,
  fee: p.fee,
  net: p.net,
  status: p.status,
  provider: p.provider,
  providerRef: p.providerRef,
  failureReason: p.failureReason,
  createdAt: p.createdAt.toISOString(),
  paidAt: iso(p.paidAt),
})

export const toDisputeDTO = (d: Dispute & { deal?: { title: string } }): DisputeDTO => ({
  id: d.id,
  dealId: d.dealId,
  ...(d.deal && { dealTitle: d.deal.title }),
  milestoneId: d.milestoneId,
  raisedById: d.raisedById,
  reason: d.reason,
  evidenceIds: d.evidenceIds,
  status: d.status,
  resolution: d.resolution,
  splitCreatorPercent: d.splitCreatorPercent,
  adminNote: d.adminNote,
  resolvedById: d.resolvedById,
  createdAt: d.createdAt.toISOString(),
  resolvedAt: iso(d.resolvedAt),
})

export const toPayoutAccountDTO = (creatorId: string, a: PayoutAccount | null): PayoutAccountDTO =>
  a
    ? {
        creatorId,
        provider: a.provider,
        providerAccountId: a.providerAccountId,
        status: a.status as PayoutAccountDTO["status"],
        detailsSubmitted: a.detailsSubmitted,
        updatedAt: a.updatedAt.toISOString(),
      }
    : { creatorId, provider: null, providerAccountId: null, status: "NOT_CONNECTED", detailsSubmitted: false, updatedAt: null }

export const toSubscriptionDTO = (s: Subscription): SubscriptionDTO => ({
  id: s.id,
  subscriberType: s.subscriberType,
  brandId: s.brandId,
  creatorId: s.creatorId,
  product: s.product as SubscriptionProductKey,
  productName: planProduct(s.product)?.name ?? s.product,
  status: s.status,
  provider: s.provider,
  providerSubscriptionId: s.providerSubscriptionId,
  priceAmount: s.priceAmount,
  currency: s.currency,
  interval: s.interval,
  currentPeriodStart: s.currentPeriodStart.toISOString(),
  currentPeriodEnd: s.currentPeriodEnd.toISOString(),
  cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  cancelledAt: iso(s.cancelledAt),
  entitled: isEntitled(s),
  note: s.note,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
})

export const toSubscriptionInvoiceDTO = (i: SubscriptionInvoice): SubscriptionInvoiceDTO => ({
  id: i.id,
  subscriptionId: i.subscriptionId,
  amount: i.amount,
  currency: i.currency,
  status: i.status,
  provider: i.provider,
  providerInvoiceId: i.providerInvoiceId,
  periodStart: i.periodStart.toISOString(),
  periodEnd: i.periodEnd.toISOString(),
  paidAt: iso(i.paidAt),
  failureReason: i.failureReason,
  createdAt: i.createdAt.toISOString(),
})

export function toEscrowSummary(
  deal: { id: string; amount: number; brandFeeRate: number; processingFeeRate: number; paymentMode: PaymentMode },
  escrow: EscrowAccount | null,
): EscrowSummary {
  const funded = escrow?.fundedAmount ?? 0
  const released = escrow?.releasedAmount ?? 0
  const refunded = escrow?.refundedAmount ?? 0
  return {
    dealId: deal.id,
    status: escrow?.status ?? "UNFUNDED",
    provider: escrow?.provider ?? null,
    fundedAmount: funded,
    releasedAmount: released,
    refundedAmount: refunded,
    availableAmount: funded - released - refunded,
    frozen: escrow?.status === "FROZEN",
    frozenAt: iso(escrow?.frozenAt),
    funding: fundingBreakdown(deal.amount, deal.brandFeeRate, deal.processingFeeRate),
    paymentMode: deal.paymentMode,
  }
}
