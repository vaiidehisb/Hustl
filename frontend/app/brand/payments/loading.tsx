import { HeaderSkeleton, ListSkeleton, StatsSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading payments">
      <HeaderSkeleton />
      <StatsSkeleton />
      <ListSkeleton rows={3} />
      <ListSkeleton rows={6} />
    </div>
  )
}
