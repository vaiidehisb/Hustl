// REST surface of the deal service (architecture doc §4.2: PATCH /deals/:id/status).
// Same state machine as the server actions; invalid transitions return 409.

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { DealTransitionError } from "@/lib/deals/machine"
import * as deals from "@/lib/deals/service"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string }
  const actor = { id: user.id, role: user.role }
  try {
    switch (body.action) {
      case "ACCEPT":
      case "DECLINE":
        await deals.respondToOffer(actor, id, body.action)
        break
      case "SIGN":
        await deals.signContract(actor, id)
        break
      case "FUND":
        await deals.fundEscrow(actor, id)
        break
      case "DISPUTE":
        await deals.raiseDispute(actor, id, body.reason ?? "Raised via API")
        break
      case "CANCEL":
        await deals.cancelDeal(actor, id)
        break
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof DealTransitionError) return NextResponse.json({ error: err.message }, { status: 409 })
    throw err
  }
}
