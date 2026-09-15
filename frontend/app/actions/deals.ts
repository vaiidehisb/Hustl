"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/session"
import * as deals from "@/lib/deals/service"
import type { MilestoneInput } from "@/lib/payments/fees"
import { run } from "./result"

const refresh = (dealId?: string) => {
  revalidatePath("/brand", "layout")
  revalidatePath("/creator", "layout")
  revalidatePath("/admin", "layout")
  if (dealId) revalidatePath(`/brand/deals/${dealId}`)
}

async function actor() {
  const u = await requireUser()
  return { id: u.id, role: u.role }
}

export async function createOfferAction(input: deals.OfferInput) {
  return run(async () => {
    const deal = await deals.createOffer(await actor(), input)
    refresh(deal.id)
    return { id: deal.id }
  })
}

export async function respondToOfferAction(dealId: string, action: "ACCEPT" | "DECLINE" | "COUNTER", counter?: { amount: number; milestones: MilestoneInput[]; note?: string }) {
  return run(async () => {
    await deals.respondToOffer(await actor(), dealId, action, counter)
    refresh(dealId)
  })
}

export async function signContractAction(dealId: string) {
  return run(async () => {
    await deals.signContract(await actor(), dealId)
    refresh(dealId)
  })
}

export async function fundEscrowAction(dealId: string) {
  return run(async () => {
    await deals.fundEscrow(await actor(), dealId)
    refresh(dealId)
  })
}

export async function submitMilestoneAction(milestoneId: string, url: string, note: string) {
  return run(async () => {
    await deals.submitMilestone(await actor(), milestoneId, url, note)
    refresh()
  })
}

export async function approveMilestoneAction(milestoneId: string) {
  return run(async () => {
    await deals.approveMilestone(await actor(), milestoneId)
    refresh()
  })
}

export async function requestRevisionAction(milestoneId: string, note: string) {
  return run(async () => {
    await deals.requestRevision(await actor(), milestoneId, note)
    refresh()
  })
}

export async function raiseDisputeAction(dealId: string, reason: string, milestoneId?: string | null) {
  return run(async () => {
    await deals.raiseDispute(await actor(), dealId, reason, milestoneId)
    refresh(dealId)
  })
}

export async function resolveDisputeAction(disputeId: string, resolution: "RELEASE_TO_CREATOR" | "REFUND_TO_BRAND", note: string) {
  return run(async () => {
    await deals.resolveDispute(await actor(), disputeId, resolution, note)
    refresh()
  })
}

export async function cancelDealAction(dealId: string) {
  return run(async () => {
    await deals.cancelDeal(await actor(), dealId)
    refresh(dealId)
  })
}

export async function sendMessageAction(dealId: string, body: string) {
  return run(async () => {
    await deals.sendMessage(await actor(), dealId, body)
    refresh(dealId)
  })
}

export async function leaveReviewAction(dealId: string, rating: number, comment: string) {
  return run(async () => {
    await deals.leaveReview(await actor(), dealId, rating, comment)
    refresh(dealId)
  })
}
