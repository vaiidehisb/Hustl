import type {
  CounterOfferRequest,
  CreateOfferRequest,
  CreateReviewRequest,
  Deal,
  DealAction,
  DealContract,
  DealDetail,
  DealsQuery,
  Dispute,
  Milestone,
  OpenDisputeRequest,
  SubmitMilestoneRequest,
} from "./types"
import { seg, type CallOptions, type Requester } from "./core"

// Invalid state transitions come back as 409 CONFLICT.
export const dealsApi = (r: Requester) => {
  const action = (id: string, name: string, body?: unknown, o?: CallOptions) => r<DealDetail>(`/deals/${seg(id)}/${name}`, { ...o, method: "POST", body })
  const milestone = (id: string, mid: string, name: string, body?: unknown, o?: CallOptions) =>
    r<Milestone>(`/deals/${seg(id)}/milestones/${seg(mid)}/${name}`, { ...o, method: "POST", body })

  return {
    /** POST /deals — brand sends an offer. */
    create: (body: CreateOfferRequest, o?: CallOptions) => r<DealDetail>("/deals", { ...o, method: "POST", body }),
    /** GET /deals?role&status */
    list: (query?: DealsQuery, o?: CallOptions) => r.withMeta<Deal[]>("/deals", { ...o, query }),
    /** GET /deals/:id — deal + offers + milestones + contract + events (party-only). */
    get: (id: string, o?: CallOptions) => r<DealDetail>(`/deals/${seg(id)}`, o),
    /** POST /deals/:id/counter — max 2 rounds. */
    counter: (id: string, body: CounterOfferRequest, o?: CallOptions) => action(id, "counter", body, o),
    accept: (id: string, o?: CallOptions) => action(id, "accept", undefined, o),
    decline: (id: string, body?: { reason?: string }, o?: CallOptions) => action(id, "decline", body, o),
    cancel: (id: string, body?: { reason?: string }, o?: CallOptions) => action(id, "cancel", body, o),
    /** PATCH /deals/:id/status — REST alias `{ action }`. */
    transition: (id: string, act: DealAction, o?: CallOptions) => r<DealDetail>(`/deals/${seg(id)}/status`, { ...o, method: "PATCH", body: { action: act } }),
    /** GET /deals/:id/contract */
    contract: (id: string, o?: CallOptions) => r<DealContract>(`/deals/${seg(id)}/contract`, o),
    /** POST /deals/:id/contract/sign */
    signContract: (id: string, signerName: string, o?: CallOptions) =>
      r<DealContract>(`/deals/${seg(id)}/contract/sign`, { ...o, method: "POST", body: { signerName } }),
    /** POST /deals/:id/milestones/:mid/submit */
    submitMilestone: (id: string, mid: string, body: SubmitMilestoneRequest, o?: CallOptions) => milestone(id, mid, "submit", body, o),
    /** POST /deals/:id/milestones/:mid/approve — triggers payment release. */
    approveMilestone: (id: string, mid: string, o?: CallOptions) => milestone(id, mid, "approve", undefined, o),
    /** POST /deals/:id/milestones/:mid/request-revision */
    requestRevision: (id: string, mid: string, note: string, o?: CallOptions) => milestone(id, mid, "request-revision", { note }, o),
    /** POST /deals/:id/disputes — freezes escrow. */
    openDispute: (id: string, body: OpenDisputeRequest, o?: CallOptions) => r<Dispute>(`/deals/${seg(id)}/disputes`, { ...o, method: "POST", body }),
    /** POST /deals/:id/reviews */
    review: (id: string, body: CreateReviewRequest, o?: CallOptions) => r<{ id: string }>(`/deals/${seg(id)}/reviews`, { ...o, method: "POST", body }),
  }
}
