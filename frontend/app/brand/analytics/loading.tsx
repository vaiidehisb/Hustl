import { HeaderSkeleton, ListSkeleton, PanelSkeleton, StatsSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading analytics">
      <HeaderSkeleton />
      <StatsSkeleton />
      <div className="grid gap-6 lg:grid-cols-5">
        <PanelSkeleton className="lg:col-span-3" height={260} />
        <PanelSkeleton className="lg:col-span-2" height={260} />
      </div>
      <ListSkeleton rows={4} />
    </div>
  )
}
