import { Suspense } from "react"
import { conversationForDealAction } from "@/app/actions/messages"
import { Inbox } from "@/components/messaging/inbox"
import { requireRole } from "@/lib/auth/session"

export const metadata = { title: "Messages · hustl." }

export default async function CreatorMessagesPage({ searchParams }: { searchParams: Promise<{ deal?: string; c?: string }> }) {
  const user = await requireRole("CREATOR", "/creator/messages")
  const { deal } = await searchParams
  const conversationId = deal ? await conversationForDealAction(deal) : null

  return (
    <Suspense fallback={null}>
      <Inbox role="CREATOR" currentUserId={user.id} initialConversationId={conversationId} dealLookupFailed={!!deal && !conversationId} />
    </Suspense>
  )
}
