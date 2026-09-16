import Link from "next/link"
import { BadgeCheck, ExternalLink, ShieldAlert } from "lucide-react"
import { UPFRONT_MIN_RELIABILITY } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { PageHeader, Panel, Pill } from "@/components/app/ui"
import { BrandProfileForm, VerificationRequestForm } from "@/components/brand/settings-forms"
import { PlanPanel } from "@/components/billing/plan-panel"
import { ErrorPanel } from "@/components/brand/error-panel"
import { loadBrandProfile, loadBilling, loadBillingProducts, loadMe, loadVerifications } from "@/components/brand/data"

export const metadata = { title: "Settings" }

export default async function BrandSettingsPage() {
  const [profileRes, meRes, verificationsRes, productsRes, billingRes] = await Promise.all([
    loadBrandProfile(),
    loadMe(),
    loadVerifications(),
    loadBillingProducts(),
    loadBilling(),
  ])

  if (!profileRes.ok) {
    return (
      <div>
        <PageHeader title="Settings" />
        <ErrorPanel error={profileRes.error} title="Couldn't load your company profile" />
      </div>
    )
  }

  const brand = profileRes.data
  const user = meRes.ok ? meRes.data.user : null
  const kycStatus = user?.kycStatus ?? "NONE"
  const latestVerification = verificationsRes.ok ? (verificationsRes.data.find((v) => v.type === "BRAND_BUSINESS") ?? null) : null

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
          <BrandProfileForm profile={brand} />
        </Panel>

        <div className="space-y-6">
          <Panel
            title={
              <span id="kyc" className="scroll-mt-24">
                Business verification
              </span>
            }
            action={
              kycStatus === "VERIFIED" ? (
                <Pill tone="success">Verified</Pill>
              ) : kycStatus === "PENDING" ? (
                <Pill tone="warning">Under review</Pill>
              ) : kycStatus === "REJECTED" ? (
                <Pill tone="danger">Rejected</Pill>
              ) : (
                <Pill tone="warning">Not verified</Pill>
              )
            }
          >
            {kycStatus === "VERIFIED" ? (
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
                  <p className="text-muted-foreground">
                    Submit your GSTIN / business PAN for review. Verification unlocks upfront payments and a badge creators trust.
                  </p>
                </div>
                {!meRes.ok ? (
                  <ErrorPanel error={meRes.error} compact />
                ) : (
                  <VerificationRequestForm
                    kycStatus={kycStatus}
                    latest={latestVerification}
                    defaults={{ legalName: brand.companyName, gstin: brand.gstin ?? "", website: brand.website ?? "" }}
                  />
                )}
              </div>
            )}
          </Panel>

          <Panel title="Account">
            {!meRes.ok ? (
              <ErrorPanel error={meRes.error} compact />
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="truncate font-medium">{user?.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate font-medium">{user?.email}</dd>
                </div>
                {meRes.data.profileCompletion && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Profile complete</dt>
                    <dd className="font-medium tabular-nums">{meRes.data.profileCompletion.percent}%</dd>
                  </div>
                )}
              </dl>
            )}
          </Panel>
        </div>

        <Panel title="Plan & billing" description="Your plan sets the platform fee added when you fund escrow. Creators never see it." className="lg:col-span-3">
          <PlanPanel plan={brand.plan} products={productsRes?.products ?? []} billing={billingRes} />
        </Panel>
      </div>
    </div>
  )
}
