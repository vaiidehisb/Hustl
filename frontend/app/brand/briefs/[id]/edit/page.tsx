import { PageHeader, TextLink } from "@/components/app/ui"
import { BriefComposer, type BriefFormValues } from "@/components/brand/brief-composer"
import { ErrorPanel } from "@/components/brand/error-panel"
import { loadBrief } from "@/components/brand/data"
import { isoToDate } from "@/components/brand/helpers"

export const metadata = { title: "Edit brief · hustl." }

export default async function EditBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await loadBrief(id)

  if (!res.ok) {
    return (
      <div>
        <PageHeader title="Edit brief" />
        <ErrorPanel error={res.error} title="Couldn't load this brief" />
      </div>
    )
  }

  const b = res.data
  const initial: BriefFormValues = {
    title: b.title,
    description: b.description,
    requirements: b.requirements ?? "",
    niche: b.niche ?? "",
    platforms: b.platforms,
    deliverables: b.deliverables.length ? b.deliverables : [{ type: "", quantity: 1 }],
    minFollowers: b.minFollowers ? String(b.minFollowers) : "",
    minEngagementPct: b.minEngagement ? String(+(b.minEngagement * 100).toFixed(2)) : "",
    budgetPerCreator: b.budgetPerCreator ? String(b.budgetPerCreator) : "",
    creatorsNeeded: String(b.creatorsNeeded || 1),
    locations: (b.locations ?? []).join(", "),
    timeline: b.timeline ?? "",
    audience: b.audience ?? "",
    deadline: isoToDate(b.deadline),
  }

  return (
    <div>
      <PageHeader
        eyebrow={
          <TextLink href={`/brand/briefs/${b.id}`} className="text-xs normal-case tracking-normal">
            ← {b.title}
          </TextLink>
        }
        title="Edit brief"
      />
      <BriefComposer briefId={b.id} status={b.status} initial={initial} />
    </div>
  )
}
