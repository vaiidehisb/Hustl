"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Instagram, Linkedin, Loader2, Music2, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Twitter, Youtube } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { SocialAccountDto, SocialPlatform, SocialProvidersStatus } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Panel, Pill } from "@/components/app/ui"
import { deleteSocialAccountAction, phylloSdkTokenAction, saveSelfReportedAccountAction, syncSocialsAction } from "@/app/actions/creator"
import { compact, pct, timeAgo } from "@/lib/format"
import { SELF_REPORTED_LABEL, SOCIAL_PLATFORMS, platformLabel } from "./lib"

const ICONS: Record<SocialPlatform, LucideIcon> = { INSTAGRAM: Instagram, YOUTUBE: Youtube, TIKTOK: Music2, LINKEDIN: Linkedin, X: Twitter }
const HINTS: Record<SocialPlatform, string> = {
  INSTAGRAM: "Reels, stories and posts",
  YOUTUBE: "Long-form videos and Shorts",
  TIKTOK: "Short-form video",
  LINKEDIN: "Thought leadership and B2B",
  X: "Posts and threads",
}

type Draft = { handle: string; followers: string; engagementPct: string; avgViews: string; profileUrl: string }
const emptyDraft: Draft = { handle: "", followers: "", engagementPct: "", avgViews: "", profileUrl: "" }

export function SocialsManager({ accounts, providers }: { accounts: SocialAccountDto[]; providers: SocialProvidersStatus | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<SocialPlatform | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [integrationNote, setIntegrationNote] = useState<string | null>(null)

  const byPlatform = new Map(accounts.map((a) => [a.platform, a]))
  const connected = accounts.filter((a) => a.status !== "DISCONNECTED")
  const totalFollowers = connected.reduce((s, a) => s + (a.followers ?? 0), 0)
  const weightedER = totalFollowers ? connected.reduce((s, a) => s + (a.followers ?? 0) * (a.engagementRate ?? 0), 0) / totalFollowers : null
  const lastSyncedAt = connected.map((a) => a.lastSyncedAt).filter(Boolean).sort().at(-1) ?? null
  const phylloConfigured = providers?.phyllo.configured ?? false
  const missingEnv = providers?.phyllo.missingEnv ?? []
  const phylloAccounts = connected.filter((a) => a.source === "PHYLLO").length

  const openDialog = (p: SocialPlatform) => {
    const a = byPlatform.get(p)
    setErrors({})
    setDraft(
      a && a.source === "SELF_REPORTED"
        ? {
            handle: a.handle,
            followers: a.followers !== null ? String(a.followers) : "",
            engagementPct: a.engagementRate !== null ? String(Math.round(a.engagementRate * 10000) / 100) : "",
            avgViews: a.avgViews !== null ? String(a.avgViews) : "",
            profileUrl: a.profileUrl ?? "",
          }
        : emptyDraft,
    )
    setEditing(p)
  }

  const saveSelfReported = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const platform = editing
    setBusy("save")
    setErrors({})
    startTransition(async () => {
      const res = await saveSelfReportedAccountAction({
        platform,
        handle: draft.handle.trim(),
        followers: Math.round(Number(draft.followers) || 0),
        engagementRate: Number(draft.engagementPct) || 0,
        ...(draft.avgViews ? { avgViews: Math.round(Number(draft.avgViews)) } : {}),
        ...(draft.profileUrl.trim() ? { profileUrl: draft.profileUrl.trim() } : {}),
      })
      setBusy(null)
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {})
        toast.error(res.error.message)
        return
      }
      toast.success(`${platformLabel(platform)} saved`, { description: "Stored as self-reported until a provider verifies it." })
      setEditing(null)
      router.refresh()
    })
  }

  const remove = (account: SocialAccountDto) => {
    setBusy(`rm-${account.id}`)
    startTransition(async () => {
      const res = await deleteSocialAccountAction(account.id)
      setBusy(null)
      if (!res.ok) return void toast.error(res.error.message)
      toast.success(`${platformLabel(account.platform)} removed`)
      router.refresh()
    })
  }

  const sync = () => {
    setBusy("sync")
    setIntegrationNote(null)
    startTransition(async () => {
      const res = await syncSocialsAction()
      setBusy(null)
      if (!res.ok) {
        if (res.error.code === "INTEGRATION_UNAVAILABLE") setIntegrationNote(res.error.message)
        toast.error(res.error.message)
        return
      }
      const failed = res.data.synced.filter((s) => s.error)
      toast.success(`Synced ${res.data.synced.length} account${res.data.synced.length === 1 ? "" : "s"}`, {
        description: failed.length ? `${failed.length} could not be refreshed.` : undefined,
      })
      router.refresh()
    })
  }

  const connectPhyllo = () => {
    setBusy("phyllo")
    setIntegrationNote(null)
    startTransition(async () => {
      const res = await phylloSdkTokenAction()
      setBusy(null)
      if (!res.ok) {
        setIntegrationNote(res.error.message)
        toast.error(res.error.message)
        return
      }
      const connect = (window as unknown as { PhylloConnect?: { initialize: (c: unknown) => { open: () => void } } }).PhylloConnect
      if (!connect) {
        setIntegrationNote("Phyllo issued a Connect token, but the Phyllo Connect SDK isn't loaded in this build yet — add it to finish the flow.")
        return
      }
      connect.initialize({ clientDisplayName: "hustl.", environment: res.data.environment, userId: res.data.phylloUserId, token: res.data.sdkToken }).open()
    })
  }

  return (
    <div className="space-y-6">
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              Verified sync
              {phylloConfigured ? <Pill tone="success">Phyllo connected</Pill> : <Pill tone="warning">Phyllo not configured</Pill>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {phylloConfigured ? (
                lastSyncedAt ? (
                  <>
                    Last synced{" "}
                    <span suppressHydrationWarning className="font-medium text-foreground">
                      {timeAgo(lastSyncedAt)}
                    </span>
                    . Connected accounts refresh automatically every 24 hours.
                  </>
                ) : (
                  "Connect an account through Phyllo to pull verified reach and engagement."
                )
              ) : (
                <>
                  Verified sync needs Phyllo API keys on the server{missingEnv.length ? ` (${missingEnv.join(", ")})` : ""}. Until then you can add self-reported numbers below — brands
                  always see them labelled as unverified.
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={connectPhyllo} disabled={pending}>
              {busy === "phyllo" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Connect with Phyllo
            </Button>
            <Button variant="outline" onClick={sync} disabled={pending || phylloAccounts === 0}>
              <RefreshCw className={`size-4 ${busy === "sync" ? "animate-spin" : ""}`} />
              Sync now
            </Button>
          </div>
        </div>
        {integrationNote && (
          <p className="flex items-start gap-2 border-t bg-warning-soft px-5 py-3 text-xs font-medium text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {integrationNote}
          </p>
        )}
        <div className="grid grid-cols-3 divide-x border-t text-center">
          <div className="p-4">
            <div className="font-display text-lg font-bold tabular-nums">{connected.length}</div>
            <div className="text-xs text-muted-foreground">Accounts</div>
          </div>
          <div className="p-4">
            <div className="font-display text-lg font-bold tabular-nums">{totalFollowers ? compact(totalFollowers) : "—"}</div>
            <div className="text-xs text-muted-foreground">Total reach</div>
          </div>
          <div className="p-4">
            <div className="font-display text-lg font-bold tabular-nums">{weightedER !== null ? pct(weightedER) : "—"}</div>
            <div className="text-xs text-muted-foreground">Weighted ER</div>
          </div>
        </div>
      </Panel>

      <Panel title="Accounts" description="Brands filter briefs by platform — add every account you post brand content on." bodyClassName="p-0">
        <ul className="divide-y">
          {SOCIAL_PLATFORMS.map((p) => {
            const Icon = ICONS[p]
            const a = byPlatform.get(p)
            const verified = a?.source === "PHYLLO"
            return (
              <li key={p} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${a ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {platformLabel(p)}
                      {a && (verified ? <Pill tone="success">Verified · Phyllo</Pill> : <Pill tone="warning">{SELF_REPORTED_LABEL}</Pill>)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a ? (
                        <>
                          @{a.handle}
                          {a.followers !== null && <> · {compact(a.followers)} followers</>}
                          {a.engagementRate !== null && <> · {pct(a.engagementRate)} ER</>}
                          {a.avgViews !== null && <> · {compact(a.avgViews)} avg views</>}
                          {a.syncError && <span className="text-destructive"> · {a.syncError}</span>}
                        </>
                      ) : (
                        HINTS[p]
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 sm:shrink-0">
                  {a ? (
                    <>
                      {!verified && (
                        <Button variant="outline" size="sm" onClick={() => openDialog(p)} disabled={pending}>
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(a)}>
                        {busy === `rm-${a.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => openDialog(p)} disabled={pending}>
                      <Plus className="size-3.5" /> Add self-reported
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Panel>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={saveSelfReported}>
            <DialogHeader>
              <DialogTitle>{editing && `${byPlatform.has(editing) ? "Edit" : "Add"} ${platformLabel(editing)}`}</DialogTitle>
              <DialogDescription>Enter the numbers from your {editing ? platformLabel(editing) : ""} insights for the last 30 days.</DialogDescription>
            </DialogHeader>
            <div className="my-5 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              These numbers are shown to brands as “{SELF_REPORTED_LABEL}” until a provider verifies them.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="s-handle">Handle</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                  <Input id="s-handle" className="pl-7" value={draft.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value.replace(/^@+/, "") })} aria-invalid={!!errors.handle} />
                </div>
                {errors.handle && <p className="text-xs font-medium text-destructive">{errors.handle}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-followers">Followers</Label>
                <Input
                  id="s-followers"
                  inputMode="numeric"
                  value={draft.followers}
                  placeholder="48000"
                  onChange={(e) => setDraft({ ...draft, followers: e.target.value.replace(/[^\d]/g, "") })}
                  aria-invalid={!!errors.followers}
                />
                {errors.followers && <p className="text-xs font-medium text-destructive">{errors.followers}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-er">Engagement rate (%)</Label>
                <Input
                  id="s-er"
                  inputMode="decimal"
                  value={draft.engagementPct}
                  placeholder="4.2"
                  onChange={(e) => setDraft({ ...draft, engagementPct: e.target.value.replace(/[^\d.]/g, "") })}
                  aria-invalid={!!errors.engagementRate}
                />
                {errors.engagementRate && <p className="text-xs font-medium text-destructive">{errors.engagementRate}</p>}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="s-views">Average views per post</Label>
                <Input
                  id="s-views"
                  inputMode="numeric"
                  value={draft.avgViews}
                  placeholder="Optional"
                  onChange={(e) => setDraft({ ...draft, avgViews: e.target.value.replace(/[^\d]/g, "") })}
                />
                <p className="text-xs text-muted-foreground">Engagement rate = (likes + comments + saves) ÷ followers, averaged per post.</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="s-url">Profile link</Label>
                <Input
                  id="s-url"
                  type="url"
                  value={draft.profileUrl}
                  placeholder="https://instagram.com/yourhandle (optional)"
                  onChange={(e) => setDraft({ ...draft, profileUrl: e.target.value })}
                  aria-invalid={!!errors.profileUrl}
                />
                {errors.profileUrl && <p className="text-xs font-medium text-destructive">{errors.profileUrl}</p>}
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!draft.handle.trim() || draft.followers === "" || draft.engagementPct === "" || pending}>
                {busy === "save" && <Loader2 className="size-4 animate-spin" />}
                Save account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
