import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton, PanelSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <PanelSkeleton className="lg:col-span-2" height={360} />
        <div className="space-y-6">
          <PanelSkeleton height={180} />
          <PanelSkeleton height={100} />
        </div>
        <Skeleton className="h-44 w-full rounded-xl lg:col-span-3" />
      </div>
    </div>
  )
}
