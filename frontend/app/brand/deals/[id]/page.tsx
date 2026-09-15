import { DealRoom } from "@/components/deals/deal-room"

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DealRoom dealId={id} viewer="BRAND" />
}
