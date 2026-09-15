"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FlaskConical, Instagram, Linkedin, Loader2, Music2, Pencil, Plus, RefreshCw, Unlink, Youtube } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Panel, Pill } from "@/components/app/ui"
import { removeSocialAction, saveSocialAction, syncSocialsAction } from "@/app/actions/creator"
import { compact, pct, timeAgo } from "@/lib/format"
import { SOCIAL_PLATFORMS, platformLabel, type SocialAccount, type SocialPlatform } from "./lib"

const ICONS: Record<SocialPlatform, LucideIcon> = { instagram: Instagram, youtube: Youtube, linkedin: Linkedin, tiktok: Music2 }
const HINTS: Record<SocialPlatform, string> = {
  instagram: "Reels, stories and posts",
  youtube: "Long-form videos and Shorts",
  linkedin: "Thought leadership and B2B",
  tiktok: "Short-form video (for global campaigns)",
}

type Draft = { handle: string; followers: string; engagementPct: string; avgViews: string }

export function SocialsManager({ accounts, lastSyncedAt }: { accounts: SocialAccount[]; lastSyncedAt: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<SocialPlatform | null>(null)
  const [draft, setDraft] = useState<Draft>({ handle: "", followers: "", engagementPct: "", avgViews: "" })

  const byPlatform = new Map(accounts.map((a) => [a.platform.toLowerCase(), a]))
  const totalFollowers = accounts.reduce((s, a) => s + a.followers, 0)
  const weightedER = totalFollowers ? accounts.reduce((s, a) => s + a.followers * a.engagementRate, 0) / totalFollowers : 0

  const openDialog = (p: SocialPlatform) => {
    const a = byPlatform.get(p)
    setDraft({
      handle: a?.handle ?? "",
      followers: a ? String(a.followers) : "",
      engagementPct: a ? String(Math.round(a.engagementRate * 10000) / 100) : "",
      avgViews: a?.avgViews ? String(a.avgViews) : "",
    })
    setEditing(p)
  }

  const act = (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) => {
    setBusy(key)
    startTransition(async () => {
      const res = await fn()
      setBusy(null)
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.")
      toast.success(success)
      after?.()
      router.refresh()
    })
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const p = editing
    act(
      "save",
      () =>
        saveSocialAction({
          platform: p,
          handle: draft.handle,
          followers: Number(draft.followers),
          engagementPct: Number(draft.engagementPct),
          avgViews: Number(draft.avgViews || 0),
        }),
      `${platformLabel(p)} ${byPlatform.has(p) ? "updated" : "connected"} — scores refreshed`,
      () => setEditing(null),
    )
  }

  const canSave = draft.handle.trim() && draft.followers !== "" && draft.engagementPct !== ""

  return (
    <div className="space-y-6">
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              Sync status
              <Pill tone="warning">
                <FlaskConical className="size-3" /> Test mode
              </Pill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {lastSyncedAt ? (
                <>
                  Last synced <span suppressHydrationWarning className="font-medium text-foreground">{timeAgo(lastSyncedAt)}</span>. Connected accounts auto-sync every 24h
                  once Phyllo is live.
                </>
              ) : (
                "Not synced yet. Connect an account below, then sync to update your reach and scores."
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => act("sync", () => syncSocialsAction(), "Synced — reach and scores updated")}
            disabled={pending || accounts.length === 0}
          >
            <RefreshCw className={`size-4 ${busy === "sync" ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </div>
        <div className="grid grid-cols-3 divide-x border-t text-center">
          <div className="p-4">
            <div className="font-display text-lg font-bold tabular-nums">{accounts.length}</div>
            <div className="text-xs text-muted-foreground">Connected</div>
          </div>
          <div className="p-4">
            <div className="font-display text-lg font-bold tabular-nums">{compact(totalFollowers)}</div>
            <div className="text-xs text-muted-foreground">Total reach</div>
          </div>
          <div className="p-4">
            <div className="font-display text-lg font-bold tabular-nums">{weightedER ? pct(weightedER) : "—"}</div>
            <div className="text-xs text-muted-foreground">Weighted ER</div>
          </div>
        </div>
      </Panel>

      <Panel title="Accounts" description="Brands filter briefs by platform — connect every account you post brand content on." bodyClassName="p-0">
        <ul className="divide-y">
          {SOCIAL_PLATFORMS.map((p) => {
            const Icon = ICONS[p]
            const a = byPlatform.get(p)
            return (
              <li key={p} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${a ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {platformLabel(p)}
                      {a && <Pill tone="success">Connected</Pill>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a ? (
                        <>
                          @{a.handle} · {compact(a.followers)} followers · {pct(a.engagementRate)} ER{a.avgViews ? ` · ${compact(a.avgViews)} avg views` : ""}
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
                      <Button variant="outline" size="sm" onClick={() => openDialog(p)} disabled={pending}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => act(`rm-${p}`, () => removeSocialAction(p), `${platformLabel(p)} disconnected`)}
                      >
                        {busy === `rm-${p}` ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => openDialog(p)} disabled={pending}>
                      <Plus className="size-3.5" /> Connect
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
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle>{editing && `${byPlatform.has(editing) ? "Edit" : "Connect"} ${platformLabel(editing)}`}</DialogTitle>
              <DialogDescription>Enter the numbers from your {editing ? platformLabel(editing) : ""} insights for the last 30 days.</DialogDescription>
            </DialogHeader>
            <div className="my-5 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
              <FlaskConical className="mt-px size-3.5 shrink-0" />
              Test mode — self-reported until Phyllo is connected. Numbers will be verified against live data before payouts go live.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="s-handle">Handle</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                  <Input id="s-handle" className="pl-7" value={draft.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value.replace(/^@+/, "") })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-followers">Followers</Label>
                <Input
                  id="s-followers"
                  inputMode="numeric"
                  value={draft.followers}
                  placeholder="48000"
                  onChange={(e) => setDraft({ ...draft, followers: e.target.value.replace(/[^\d]/g, "") })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-er">Engagement rate (%)</Label>
                <Input
                  id="s-er"
                  inputMode="decimal"
                  value={draft.engagementPct}
                  placeholder="4.2"
                  onChange={(e) => setDraft({ ...draft, engagementPct: e.target.value.replace(/[^\d.]/g, "") })}
                />
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
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || pending}>
                {busy === "save" && <Loader2 className="size-4 animate-spin" />}
                Save &amp; sync
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
