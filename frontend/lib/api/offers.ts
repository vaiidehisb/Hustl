// Offer negotiation is part of the deal resource; this is a focused view over it.
import { dealsApi } from "./deals"
import type { Requester } from "./core"

export const offersApi = (r: Requester) => {
  const d = dealsApi(r)
  return {
    /** POST /deals — brand sends an offer (creates the deal in OFFER_SENT). */
    send: d.create,
    /** POST /deals/:id/counter */
    counter: d.counter,
    /** POST /deals/:id/accept */
    accept: d.accept,
    /** POST /deals/:id/decline */
    decline: d.decline,
  }
}
