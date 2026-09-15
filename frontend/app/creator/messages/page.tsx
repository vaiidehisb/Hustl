import { Inbox } from "@/components/deals/inbox"
import { requireCreator } from "@/lib/session"

export default async function CreatorMessages() {
  const { creator } = await requireCreator()
  return <Inbox party="CREATOR" profileId={creator.id} />
}
