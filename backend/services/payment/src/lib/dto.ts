import type { Dispute, EscrowAccount, LedgerEntry, PaymentIntent, Payout, PayoutAccount } from "@hustl/db"
import {
  fundingBreakdown,
  type DisputeDTO,
  type EscrowSummary,
  type LedgerEntryDTO,
  type PaymentIntentDTO,
  type PaymentMode,
  type PayoutAccountDTO,
  type PayoutDTO,
} from "@hustl/contracts"

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
