import { Inbox } from "@/components/deals/inbox"
import { requireBrand } from "@/lib/session"

export default async function BrandMessages() {
  const { brand } = await requireBrand()
  return <Inbox party="BRAND" profileId={brand.id} />
}
