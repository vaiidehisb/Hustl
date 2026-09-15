import Link from "next/link"
import { MessagesSquare } from "lucide-react"
import { db } from "@/lib/db"
import { timeAgo } from "@/lib/format"
import { Avatar, EmptyState, PageHeader, StatusBadge } from "@/components/app/ui"

export async function Inbox({ party, profileId }: { party: "BRAND" | "CREATOR"; profileId: string }) {
  const deals = await db.deal.findMany({
    where: party === "BRAND" ? { brandId: profileId } : { creatorId: profileId },
    include: {
      brand: { select: { companyName: true, logoUrl: true } },
      creator: { select: { handle: true, avatarUrl: true, user: { select: { name: true, image: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { name: true } } } },
      _count: { select: { messages: true } },
    },
  })
  const threads = deals
    .map((d) => ({ deal: d, last: d.messages[0], at: d.messages[0]?.createdAt ?? d.updatedAt }))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
  const base = party === "BRAND" ? "/brand/deals" : "/creator/deals"

  return (
    <div>
      <PageHeader title="Messages" description="Every conversation lives with its deal, so terms, files and approvals stay in one place." />
      {threads.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No conversations yet" description="Threads open automatically when an offer is sent." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {threads.map(({ deal, last, at }) => {
            const name = party === "BRAND" ? deal.creator.user.name : deal.brand.companyName
            const image = party === "BRAND" ? (deal.creator.avatarUrl ?? deal.creator.user.image) : deal.brand.logoUrl
            return (
              <li key={deal.id}>
                <Link href={`${base}/${deal.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50">
                  <Avatar name={name} src={image} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">· {deal.title}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {last ? `${last.sender.name.split(" ")[0]}: ${last.body}` : "No messages yet"}
                    </p>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <span className="text-xs text-muted-foreground">{timeAgo(at)}</span>
                    <StatusBadge status={deal.status} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
