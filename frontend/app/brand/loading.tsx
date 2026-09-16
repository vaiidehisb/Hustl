import { HeaderSkeleton, PanelSkeleton, StatsSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <HeaderSkeleton />
      <StatsSkeleton />
      <div className="grid gap-6 lg:grid-cols-5">
        <PanelSkeleton className="lg:col-span-3" height={230} />
        <PanelSkeleton className="lg:col-span-2" height={230} />
      </div>
    </div>
  )
}
