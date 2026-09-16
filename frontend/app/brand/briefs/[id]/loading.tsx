import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton, TabsSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading brief">
      <HeaderSkeleton />
      <TabsSkeleton />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl bg-muted/40 p-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
