import { Suspense } from "react"
import { conversationForDealAction } from "@/app/actions/messages"
import { Inbox } from "@/components/messaging/inbox"
import { requireRole } from "@/lib/auth/session"

export const metadata = { title: "Messages" }

export default async function BrandMessagesPage({ searchParams }: { searchParams: Promise<{ deal?: string; c?: string }> }) {
  const user = await requireRole("BRAND", "/brand/messages")
  const { deal } = await searchParams
  // `?deal=<id>` from the deal room resolves to that deal's conversation.
  const conversationId = deal ? await conversationForDealAction(deal) : null

  return (
    <Suspense fallback={null}>
      <Inbox role="BRAND" currentUserId={user.id} initialConversationId={conversationId} dealLookupFailed={!!deal && !conversationId} />
    </Suspense>
  )
}
