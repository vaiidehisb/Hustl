import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading brief composer">
      <HeaderSkeleton />
      <div className="mx-auto max-w-3xl space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-40 w-full" />
        <div className="flex justify-end gap-2">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
    </div>
  )
}
