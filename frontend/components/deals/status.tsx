// Deal vocabulary shared by the deal room. Server-safe (no hooks) so server
// components can render badges directly. Labels cover the backend's real
// DealStatus / MilestoneStatus enums from @hustl/contracts.
import type { DealStatus, MilestoneStatus, PaymentMode } from "@hustl/contracts"
import { Pill } from "@/components/app/ui"
import type { Tone } from "@/lib/deals/machine"

export const MODE_LABEL: Record<PaymentMode, string> = {
  COMPLETION: "Full on completion",
  UPFRONT: "Full upfront release",
  MILESTONES: "Custom milestones",
}

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  OFFER_SENT: "Offer sent",
  NEGOTIATING: "Negotiating",
  AGREED: "Agreed",
  CONTRACT_SIGNED: "Contract signed",
  FUNDED: "Escrow funded",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
}

const DEAL_STATUS_TONE: Record<DealStatus, Tone> = {
  OFFER_SENT: "info",
  NEGOTIATING: "warning",
  AGREED: "info",
  CONTRACT_SIGNED: "info",
  FUNDED: "brand",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  DISPUTED: "danger",
  CANCELLED: "neutral",
}

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  REVISION_REQUESTED: "Revision requested",
  APPROVED: "Approved",
  RELEASED: "Paid out",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
}

const MILESTONE_STATUS_TONE: Record<MilestoneStatus, Tone> = {
  PENDING: "neutral",
  SUBMITTED: "warning",
  REVISION_REQUESTED: "danger",
  APPROVED: "info",
  RELEASED: "success",
  DISPUTED: "danger",
  REFUNDED: "neutral",
}

export function DealStatusBadge({ status }: { status: DealStatus }) {
  return (
    <Pill tone={DEAL_STATUS_TONE[status] ?? "neutral"}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {DEAL_STATUS_LABEL[status] ?? status}
    </Pill>
  )
}

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return (
    <Pill tone={MILESTONE_STATUS_TONE[status] ?? "neutral"}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {MILESTONE_STATUS_LABEL[status] ?? status}
    </Pill>
  )
}

/** Progress tracker stages; NEGOTIATING folds into the offer stage. */
export const DEAL_STAGES: { key: DealStatus; label: string }[] = [
  { key: "OFFER_SENT", label: "Offer" },
  { key: "AGREED", label: "Agreed" },
  { key: "CONTRACT_SIGNED", label: "Signed" },
  { key: "FUNDED", label: "Escrow" },
  { key: "IN_PROGRESS", label: "Delivery" },
  { key: "COMPLETED", label: "Complete" },
]

/** Index into DEAL_STAGES for the current status (-1 when cancelled). */
export function stageIndex(status: DealStatus): number {
  switch (status) {
    case "OFFER_SENT":
    case "NEGOTIATING":
      return 0
    case "AGREED":
      return 1
    case "CONTRACT_SIGNED":
      return 2
    case "FUNDED":
      return 3
    case "IN_PROGRESS":
    case "DISPUTED":
      return 4
    case "COMPLETED":
      return 5
    default:
      return -1
  }
}

const EVENT_LABEL: Record<string, string> = {
  OFFER_SENT: "Offer sent",
  OFFER_COUNTERED: "Counter-offer sent",
  OFFER_ACCEPTED: "Offer accepted",
  OFFER_DECLINED: "Offer declined",
  DEAL_CANCELLED: "Deal cancelled",
  CONTRACT_GENERATED: "Contract generated",
  CONTRACT_SIGNED_BY_BRAND: "Signed by the brand",
  CONTRACT_SIGNED_BY_CREATOR: "Signed by the creator",
  CONTRACT_FULLY_SIGNED: "Contract fully executed",
  FRAUD_HOLD_APPLIED: "Safety hold applied",
  ESCROW_FUNDED: "Escrow funded",
  PAYMENT_FUNDED: "Escrow funded",
  DEAL_STARTED: "Work started",
  MILESTONE_SUBMITTED: "Deliverable submitted",
  MILESTONE_APPROVED: "Deliverable approved",
  MILESTONE_REVISION_REQUESTED: "Revision requested",
  MILESTONE_RELEASED: "Payment released",
  MILESTONE_PAYMENT_RELEASED: "Payment released",
  MILESTONE_PARTIAL_REFUND: "Partial refund issued",
  DISPUTE_OPENED: "Dispute raised",
  DISPUTE_RESOLVED: "Dispute resolved",
  REVIEW_SUBMITTED: "Review posted",
  DEAL_COMPLETED: "Deal completed",
}

export function eventLabel(type: string, toStatus: DealStatus | null): string {
  return EVENT_LABEL[type] ?? (toStatus ? DEAL_STATUS_LABEL[toStatus] : type.replace(/_/g, " ").toLowerCase())
}
