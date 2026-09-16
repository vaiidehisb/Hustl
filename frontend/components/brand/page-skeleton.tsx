import { Skeleton } from "@/components/ui/skeleton"

export function HeaderSkeleton() {
  return (
    <div className="mb-8 space-y-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  )
}

export function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  )
}

export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-6 flex gap-4 border-b pb-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-20" />
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-5 w-20 sm:block" />
        </div>
      ))}
    </div>
  )
}

export function CardGridSkeleton({ cards = 6, className = "grid gap-4 sm:grid-cols-2 2xl:grid-cols-3" }: { cards?: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
          <Skeleton className="mt-4 h-14 w-full" />
          <div className="mt-4 flex justify-end gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PanelSkeleton({ height = 240, className }: { height?: number; className?: string }) {
  return (
    <div className={`rounded-xl border bg-card ${className ?? ""}`}>
      <div className="border-b px-5 py-4">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="p-5">
        <Skeleton className="w-full" style={{ height }} />
      </div>
    </div>
  )
}
