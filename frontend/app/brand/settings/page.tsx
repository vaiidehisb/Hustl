import Link from "next/link"
import { BadgeCheck, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader, Panel, Pill } from "@/components/app/ui"
import { BrandProfileForm, PlanPicker, VerifyKycButton } from "@/components/brand/settings-forms"
import { UPFRONT_MIN_RELIABILITY } from "@/lib/payments/fees"
import { requireBrand } from "@/lib/session"

export const metadata = { title: "Settings · hustl." }

export default async function BrandSettingsPage() {
  const { user, brand } = await requireBrand()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your company profile is what creators see before accepting an offer."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/brands/${brand.slug}`} target="_blank">
              View public profile <ExternalLink />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Company profile" description={`hustl.in/brands/${brand.slug}`} className="lg:col-span-2">
          <BrandProfileForm
            initial={{
              companyName: brand.companyName,
              website: brand.website,
              industry: brand.industry,
              description: brand.description,
              location: brand.location,
              size: brand.size,
              logoUrl: brand.logoUrl ?? "",
            }}
          />
        </Panel>

        <div className="space-y-6">
          <Panel
            title={
              <span id="kyc" className="scroll-mt-24">
                Business verification
              </span>
            }
            action={user.kycVerified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Not verified</Pill>}
          >
            {user.kycVerified ? (
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                  <BadgeCheck className="size-5" />
                </span>
                <div className="text-sm">
                  <p className="font-medium">{brand.companyName} is verified</p>
                  <p className="mt-1 text-muted-foreground">
                    You can offer upfront payments to creators with reliability above {UPFRONT_MIN_RELIABILITY}, and your profile shows a verified badge.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
                    <ShieldAlert className="size-5" />
                  </span>
                  <p className="text-muted-foreground">Verify your GSTIN / business PAN to unlock upfront payments and earn a verified badge creators trust.</p>
                </div>
                <VerifyKycButton />
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0" /> Test mode: verification is instant. In production this runs through the KYC provider.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Account">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="truncate font-medium">{user.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate font-medium">{user.email}</dd>
              </div>
            </dl>
          </Panel>
        </div>

        <Panel title="Plan" description="Your plan sets the platform fee added when you fund escrow. Creators never see it." className="lg:col-span-3">
          <PlanPicker plan={brand.plan} />
        </Panel>
      </div>
    </div>
  )
}
