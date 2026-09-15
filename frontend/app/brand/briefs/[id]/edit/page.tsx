import { notFound } from "next/navigation"
import { PageHeader, TextLink } from "@/components/app/ui"
import { BriefComposer } from "@/components/brand/brief-composer"
import { db, json } from "@/lib/db"
import { requireBrand } from "@/lib/session"

export const metadata = { title: "Edit brief · hustl." }

export default async function EditBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { brand } = await requireBrand()
  const { id } = await params
  const b = await db.brief.findUnique({ where: { id } })
  if (!b || b.brandId !== brand.id) notFound()

  return (
    <div>
      <PageHeader eyebrow={<TextLink href={`/brand/briefs/${b.id}`} className="text-xs normal-case tracking-normal">← {b.title}</TextLink>} title="Edit brief" />
      <BriefComposer
        briefId={b.id}
        status={b.status}
        initial={{
          title: b.title,
          description: b.description,
          niche: b.niche,
          platforms: json<string[]>(b.platforms, []),
          deliverables: json<{ type: string; quantity: number }[]>(b.deliverables, []),
          minFollowers: b.minFollowers,
          minEngagement: b.minEngagement,
          budgetPerCreator: b.budgetPerCreator,
          creatorsNeeded: b.creatorsNeeded,
          location: b.location,
          timeline: b.timeline,
          audience: b.audience,
          deadline: b.deadline ? b.deadline.toISOString().slice(0, 10) : "",
        }}
      />
    </div>
  )
}
