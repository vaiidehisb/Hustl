import { CardGridSkeleton, HeaderSkeleton, TabsSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading briefs">
      <HeaderSkeleton />
      <TabsSkeleton />
      <CardGridSkeleton cards={4} className="grid gap-4 md:grid-cols-2" />
    </div>
  )
}
