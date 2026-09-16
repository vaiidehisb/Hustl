import { HeaderSkeleton, ListSkeleton, TabsSkeleton } from "@/components/brand/page-skeleton"

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading deals">
      <HeaderSkeleton />
      <TabsSkeleton count={5} />
      <ListSkeleton rows={7} />
    </div>
  )
}
