import { DealRoom } from "@/components/deals/deal-room"

export const metadata = { title: "Deal · hustl." }

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DealRoom dealId={id} viewer="BRAND" />
}
