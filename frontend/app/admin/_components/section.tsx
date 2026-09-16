"use client"
// Loading / error / empty scaffolding shared by the admin tabs.
import type { UseQueryResult } from "@tanstack/react-query"
import type { LucideIcon } from "lucide-react"
import { ApiErrorState } from "@/components/app/states"
import { EmptyState } from "@/components/app/ui"
import { Skeleton } from "@/components/ui/skeleton"

export function AdminSection<T>({
  query,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  skeletonRows = 3,
  children,
}: {
  query: UseQueryResult<T>
  isEmpty: (data: T) => boolean
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription?: string
  skeletonRows?: number
  children: (data: T) => React.ReactNode
}) {
  if (query.isPending)
    return (
      <div className="space-y-3">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    )
  if (query.isError) return <ApiErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (isEmpty(query.data)) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
  return <>{children(query.data)}</>
}
