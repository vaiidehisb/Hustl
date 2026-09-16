import { PageHeader, TextLink } from "@/components/app/ui"
import { BriefComposer } from "@/components/brand/brief-composer"
import { requireRole } from "@/lib/auth/session"

export const metadata = { title: "Post a brief · hustl." }

export default async function NewBriefPage() {
  await requireRole("BRAND", "/brand/briefs/new")
  return (
    <div>
      <PageHeader
        eyebrow={
          <TextLink href="/brand/briefs" className="text-xs normal-case tracking-normal">
            ← Briefs
          </TextLink>
        }
        title="Post a brief"
        description="Write it the way you'd explain it to a colleague. AI structures it, you confirm, and matched creators can apply."
      />
      <BriefComposer />
    </div>
  )
}
