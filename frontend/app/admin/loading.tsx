import { PageHeader } from "@/components/app/ui"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div>
      <PageHeader title="Trust & safety" description="Resolve disputes, work the fraud queue, decide verifications and manage accounts." />
      <Skeleton className="mb-6 h-10 w-full max-w-xl rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
