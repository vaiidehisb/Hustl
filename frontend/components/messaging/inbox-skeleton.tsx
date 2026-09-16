import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/app/ui"

export function InboxSkeleton() {
  return (
    <div>
      <PageHeader title="Messages" description="Every conversation with the deal or application it belongs to, so context never gets lost." />
      <div className="flex h-[calc(100dvh-13rem)] min-h-[32rem] overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="hidden w-80 flex-col gap-3 border-r p-4 md:flex lg:w-96">
          <Skeleton className="h-9 w-full rounded-md" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-1.5">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={`h-12 w-2/3 rounded-2xl${i % 2 ? " ml-auto" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
