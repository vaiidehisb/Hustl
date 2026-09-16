import { Skeleton } from "@/components/ui/skeleton"
import { CardGridSkeleton, HeaderSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading creators">
      <HeaderSkeleton />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="mt-3 h-12 w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <Skeleton className="hidden h-[420px] rounded-xl lg:block" />
        <CardGridSkeleton />
      </div>
    </div>
  )
}
