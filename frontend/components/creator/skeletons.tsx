import { Skeleton } from "@/components/ui/skeleton"

function Header() {
  return (
    <div className="mb-8 space-y-2">
      <Skeleton className="h-8 w-64 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  )
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-7 w-28" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={`rounded-xl border bg-card ${className ?? ""}`}>
      <div className="border-b px-5 py-4">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-4 p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div>
      <Header />
      <StatsSkeleton />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PanelSkeleton rows={4} />
          <PanelSkeleton rows={3} />
        </div>
        <div className="space-y-6">
          <PanelSkeleton rows={5} />
          <PanelSkeleton rows={3} />
        </div>
      </div>
    </div>
  )
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div>
      <Header />
      <Skeleton className="mb-6 h-10 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="ml-auto size-11 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-5 w-4/5" />
            <Skeleton className="mt-3 h-4 w-1/3" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div>
      <Header />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={4} />
        </div>
        <div className="space-y-6">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={2} />
        </div>
      </div>
    </div>
  )
}

export function ListSkeleton() {
  return (
    <div>
      <Header />
      <Skeleton className="mb-6 h-9 w-72 max-w-full rounded-lg" />
      <PanelSkeleton rows={6} />
    </div>
  )
}
