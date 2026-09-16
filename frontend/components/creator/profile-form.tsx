"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertCircle, BadgeCheck, Check, ImagePlus, Languages, Loader2, MapPin, Plus, Trash2, Upload, X } from "lucide-react"
import type { OwnCreatorProfile, UpdateCreatorProfileRequest } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, Panel, Pill } from "@/components/app/ui"
import { saveProfileAction } from "@/app/actions/creator"
import { compact, inr, pct } from "@/lib/format"
import { cn } from "@/lib/utils"
import { BIO_MAX, HANDLE_RE, HEADLINE_MAX, NICHES, NICHE_MAX, nicheLabel, normalizeHandle } from "./lib"
import { uploadErrorMessage, uploadMedia } from "./uploader"

type RateRow = { deliverable: string; price: string }
type WorkRow = { title: string; url: string; brand: string; mediaId?: string }
type FormState = {
  handle: string
  headline: string
  bio: string
  location: string
  available: boolean
  avatarUrl: string | null
  niches: string[]
  languages: string[]
  rateCard: RateRow[]
  portfolio: WorkRow[]
}

const DELIVERABLE_SUGGESTIONS = ["Instagram Reel", "Instagram Story", "Carousel post", "YouTube video", "YouTube Short", "LinkedIn post", "TikTok video"]

function toState(p: OwnCreatorProfile): FormState {
  return {
    handle: p.handle,
    headline: p.headline,
    bio: p.bio,
    location: p.location,
    available: p.available,
    avatarUrl: p.avatarUrl,
    niches: [...p.niches],
    languages: [...p.languages],
    rateCard: p.rateCard.map((r) => ({ deliverable: r.deliverable, price: String(r.price) })),
    portfolio: p.portfolio.map((w) => ({ title: w.title, url: w.url, brand: w.brand ?? "", mediaId: w.mediaId })),
  }
}

function toRequest(form: FormState): UpdateCreatorProfileRequest {
  return {
    handle: normalizeHandle(form.handle),
    headline: form.headline.trim(),
    bio: form.bio.trim(),
    location: form.location.trim(),
    available: form.available,
    avatarUrl: form.avatarUrl,
    niches: form.niches as UpdateCreatorProfileRequest["niches"],
    languages: form.languages,
    rateCard: form.rateCard.filter((r) => r.deliverable.trim()).map((r) => ({ deliverable: r.deliverable.trim(), price: Math.round(Number(r.price) || 0) })),
    portfolio: form.portfolio
      .filter((w) => w.title.trim() || w.url.trim())
      .map((w) => ({ title: w.title.trim(), url: w.url.trim(), ...(w.brand.trim() ? { brand: w.brand.trim() } : {}), ...(w.mediaId ? { mediaId: w.mediaId } : {}) })),
  }
}

export function ProfileForm({
  profile,
  name,
  followersTotal,
  engagementRate,
  verified,
}: {
  profile: OwnCreatorProfile
  name: string
  followersTotal: number
  engagementRate: number | null
  verified: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState>(() => toState(profile))
  const saved = useRef(JSON.stringify(toState(profile)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [langDraft, setLangDraft] = useState("")
  const [uploading, setUploading] = useState<string | null>(null)
  const [storageNote, setStorageNote] = useState<string | null>(null)
  const avatarInput = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(form) !== saved.current
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const handle = normalizeHandle(form.handle)
  const handleInvalid = !HANDLE_RE.test(handle)

  const toggleNiche = (n: string) => {
    const has = form.niches.includes(n)
    if (!has && form.niches.length >= NICHE_MAX) return void toast.info(`Pick up to ${NICHE_MAX} niches — focused creators rank higher.`)
    set("niches", has ? form.niches.filter((x) => x !== n) : [...form.niches, n])
  }

  const addLanguage = () => {
    const l = langDraft.trim().replace(/,$/, "")
    if (l && !form.languages.some((x) => x.toLowerCase() === l.toLowerCase()) && form.languages.length < 10) set("languages", [...form.languages, l])
    setLangDraft("")
  }

  const pickAvatar = async (file: File) => {
    setUploading("avatar")
    setStorageNote(null)
    try {
      const up = await uploadMedia(file, "AVATAR")
      if (!up.absolute) {
        setStorageNote(
          "The media service is running on the local storage driver, which only issues short-lived relative links — profile photos need S3/R2 (STORAGE_DRIVER=s3) before they can be saved.",
        )
        toast.error("Upload stored, but this storage driver can't give a public photo URL yet.")
        return
      }
      set("avatarUrl", up.url)
      toast.success("Photo uploaded — save your profile to publish it.")
    } catch (err) {
      toast.error(uploadErrorMessage(err))
    } finally {
      setUploading(null)
      if (avatarInput.current) avatarInput.current.value = ""
    }
  }

  const pickPortfolioFile = async (index: number, file: File) => {
    setUploading(`work-${index}`)
    setStorageNote(null)
    try {
      const up = await uploadMedia(file, "PORTFOLIO")
      if (!up.absolute) {
        setStorageNote("Portfolio uploads need S3/R2 storage (STORAGE_DRIVER=s3) to produce a shareable link — paste the post URL instead for now.")
        toast.error("Uploaded, but this storage driver can't give a shareable link yet.")
        return
      }
      set(
        "portfolio",
        form.portfolio.map((w, j) => (j === index ? { ...w, url: up.url, mediaId: up.asset.id, title: w.title || file.name } : w)),
      )
      toast.success("File uploaded — save your profile to publish it.")
    } catch (err) {
      toast.error(uploadErrorMessage(err))
    } finally {
      setUploading(null)
    }
  }

  const save = () => {
    setErrors({})
    startTransition(async () => {
      const res = await saveProfileAction(toRequest(form))
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {})
        toast.error(res.error.message)
        return
      }
      const next = toState(res.data)
      setForm(next)
      saved.current = JSON.stringify(next)
      toast.success("Profile saved", { description: "Your scores and brand matches refresh in the background." })
      router.refresh()
    })
  }

  const prices = form.rateCard.map((r) => Number(r.price)).filter((p) => p > 0)
  const fieldError = (key: string) => errors[key] ?? Object.entries(errors).find(([k]) => k.startsWith(`${key}.`))?.[1]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div id="basics" className="scroll-mt-24">
          <Panel title="Basics" description="How brands find and recognise you.">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex items-center gap-4 sm:col-span-2">
                <Avatar name={name} src={form.avatarUrl} size={64} />
                <div className="min-w-0">
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void pickAvatar(f)
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={uploading === "avatar"} onClick={() => avatarInput.current?.click()}>
                      {uploading === "avatar" ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                      {form.avatarUrl ? "Replace photo" : "Upload photo"}
                    </Button>
                    {form.avatarUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => set("avatarUrl", null)}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">JPG, PNG, WebP or GIF, up to 5MB.</p>
                  {fieldError("avatarUrl") && <p className="mt-1 text-xs font-medium text-destructive">{fieldError("avatarUrl")}</p>}
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="handle">Handle</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                  <Input
                    id="handle"
                    value={form.handle}
                    onChange={(e) => set("handle", e.target.value.replace(/\s/g, "").toLowerCase())}
                    className="pl-7 pr-9"
                    maxLength={30}
                    aria-invalid={handleInvalid || !!fieldError("handle")}
                    aria-describedby="handle-status"
                  />
                  {(handleInvalid || fieldError("handle")) && <AlertCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-destructive" />}
                </div>
                <p id="handle-status" className={cn("text-xs", handleInvalid || fieldError("handle") ? "text-destructive" : "text-muted-foreground")}>
                  {fieldError("handle") ??
                    (handleInvalid ? "3–30 characters: lowercase letters, numbers, dots and underscores." : `Your public profile: hustl.in/creators/${handle || "…"}`)}
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <div className="flex justify-between">
                  <Label htmlFor="headline">Headline</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {form.headline.length}/{HEADLINE_MAX}
                  </span>
                </div>
                <Input
                  id="headline"
                  value={form.headline}
                  maxLength={HEADLINE_MAX}
                  onChange={(e) => set("headline", e.target.value)}
                  placeholder="Budget skincare for Indian skin · 3 reels a week"
                  aria-invalid={!!fieldError("headline")}
                />
                {fieldError("headline") && <p className="text-xs font-medium text-destructive">{fieldError("headline")}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={form.location} maxLength={100} onChange={(e) => set("location", e.target.value)} placeholder="Mumbai, India" />
                {fieldError("location") && <p className="text-xs font-medium text-destructive">{fieldError("location")}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="languages">Languages</Label>
                <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/50">
                  {form.languages.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {l}
                      <button
                        type="button"
                        aria-label={`Remove ${l}`}
                        onClick={() =>
                          set(
                            "languages",
                            form.languages.filter((x) => x !== l),
                          )
                        }
                      >
                        <X className="size-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="languages"
                    value={langDraft}
                    onChange={(e) => setLangDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault()
                        addLanguage()
                      } else if (e.key === "Backspace" && !langDraft && form.languages.length) set("languages", form.languages.slice(0, -1))
                    }}
                    onBlur={addLanguage}
                    placeholder={form.languages.length ? "" : "Hindi, English…"}
                    className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-4 sm:col-span-2">
                <div>
                  <Label htmlFor="available" className="text-sm font-medium">
                    Available for new collaborations
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">When off, you&apos;re hidden from brand search and matches flag you as unavailable.</p>
                </div>
                <Switch id="available" checked={form.available} onCheckedChange={(v) => set("available", v)} />
              </div>
            </div>
          </Panel>
        </div>

        <div id="bio" className="scroll-mt-24">
          <Panel title="Bio" description="Who you create for, what you're known for, and results you've driven.">
            <Textarea
              value={form.bio}
              maxLength={BIO_MAX}
              rows={5}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="I make honest, 60-second skincare breakdowns for college students on a budget…"
              aria-invalid={!!fieldError("bio")}
            />
            <div className="mt-2 flex justify-between text-xs">
              <span className={fieldError("bio") ? "font-medium text-destructive" : "text-muted-foreground"}>
                {fieldError("bio") ?? (form.bio.trim().length < 40 ? "Aim for at least 40 characters." : "Looking good.")}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {form.bio.length}/{BIO_MAX}
              </span>
            </div>
          </Panel>
        </div>

        <div id="niches" className="scroll-mt-24">
          <Panel title="Niches" description={`Pick up to ${NICHE_MAX}. Fewer, sharper niches raise your niche authority score.`}>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Niches">
              {NICHES.map((n) => {
                const on = form.niches.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleNiche(n)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                    {nicheLabel(n)}
                  </button>
                )
              })}
            </div>
            {fieldError("niches") && <p className="mt-2 text-xs font-medium text-destructive">{fieldError("niches")}</p>}
          </Panel>
        </div>

        <div id="rates" className="scroll-mt-24">
          <Panel
            title="Rate card"
            description="Indicative prices brands see on your profile. You can always negotiate per deal."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => set("rateCard", [...form.rateCard, { deliverable: "", price: "" }])} disabled={form.rateCard.length >= 20}>
                <Plus className="size-3.5" /> Add
              </Button>
            }
          >
            <datalist id="deliverable-suggestions">
              {DELIVERABLE_SUGGESTIONS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            {form.rateCard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rates yet. Creators with a rate card get shortlisted faster — start with your most requested format.</p>
            ) : (
              <div className="space-y-2">
                {form.rateCard.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      aria-label="Deliverable"
                      list="deliverable-suggestions"
                      value={row.deliverable}
                      placeholder="Instagram Reel"
                      onChange={(e) =>
                        set(
                          "rateCard",
                          form.rateCard.map((r, j) => (j === i ? { ...r, deliverable: e.target.value } : r)),
                        )
                      }
                      className="flex-1"
                    />
                    <div className="relative w-32 shrink-0 sm:w-40">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                      <Input
                        aria-label="Price"
                        inputMode="numeric"
                        value={row.price}
                        placeholder="15000"
                        onChange={(e) =>
                          set(
                            "rateCard",
                            form.rateCard.map((r, j) => (j === i ? { ...r, price: e.target.value.replace(/[^\d]/g, "") } : r)),
                          )
                        }
                        className="pl-7 tabular-nums"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove rate"
                      onClick={() =>
                        set(
                          "rateCard",
                          form.rateCard.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {fieldError("rateCard") && <p className="mt-2 text-xs font-medium text-destructive">{fieldError("rateCard")}</p>}
          </Panel>
        </div>

        <div id="portfolio" className="scroll-mt-24">
          <Panel
            title="Portfolio"
            description="Your best work — link the live post, or upload the file."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("portfolio", [...form.portfolio, { title: "", url: "", brand: "" }])}
                disabled={form.portfolio.length >= 30}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            }
          >
            {form.portfolio.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add 2–3 links. A single strong brand reel often matters more than follower count.</p>
            ) : (
              <div className="space-y-3">
                {form.portfolio.map((row, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      aria-label="Title"
                      value={row.title}
                      placeholder="Diwali skincare reel — 1.2M views"
                      onChange={(e) =>
                        set(
                          "portfolio",
                          form.portfolio.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)),
                        )
                      }
                    />
                    <Input
                      aria-label="Brand (optional)"
                      value={row.brand}
                      placeholder="Brand (optional)"
                      onChange={(e) =>
                        set(
                          "portfolio",
                          form.portfolio.map((r, j) => (j === i ? { ...r, brand: e.target.value } : r)),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove portfolio item"
                      className="justify-self-end sm:row-span-2"
                      onClick={() =>
                        set(
                          "portfolio",
                          form.portfolio.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                    <div className="flex gap-2 sm:col-span-2">
                      <Input
                        aria-label="Link"
                        type="url"
                        inputMode="url"
                        value={row.url}
                        placeholder="https://instagram.com/reel/…"
                        className="flex-1"
                        onChange={(e) =>
                          set(
                            "portfolio",
                            form.portfolio.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)),
                          )
                        }
                      />
                      <label className="shrink-0">
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void pickPortfolioFile(i, f)
                            e.target.value = ""
                          }}
                        />
                        <span
                          className={cn(
                            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted",
                            uploading === `work-${i}` && "pointer-events-none opacity-60",
                          )}
                        >
                          {uploading === `work-${i}` ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                          Upload
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {fieldError("portfolio") && <p className="mt-2 text-xs font-medium text-destructive">{fieldError("portfolio")}</p>}
          </Panel>
        </div>

        {storageNote && <p className="rounded-lg bg-warning-soft px-4 py-3 text-xs font-medium text-warning">{storageNote}</p>}

        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={cn("size-2 rounded-full", dirty ? "bg-warning" : "bg-success")} />
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="flex gap-2">
            {dirty && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setForm(JSON.parse(saved.current) as FormState)}>
                Discard
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!dirty || pending || handleInvalid}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      </form>

      {/* Live preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Live preview — what brands see</div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="h-16 bg-brand-gradient" />
          <div className="px-5 pb-5">
            <div className="-mt-8 flex items-end justify-between">
              <Avatar name={name} src={form.avatarUrl} size={64} className="ring-4 ring-card" />
              {form.available ? <Pill tone="success">Available</Pill> : <Pill>Not taking work</Pill>}
            </div>
            <div className="mt-3 flex items-center gap-1 font-semibold">
              {name}
              {verified && <BadgeCheck className="size-4 text-primary" aria-label="Verified" />}
            </div>
            <div className="text-sm text-muted-foreground">@{handle || "handle"}</div>
            <p className={cn("mt-2 text-sm", !form.headline && "italic text-muted-foreground")}>{form.headline || "Your headline appears here"}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {form.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {form.location}
                </span>
              )}
              {form.languages.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Languages className="size-3" />
                  {form.languages.join(", ")}
                </span>
              )}
            </div>
            {form.niches.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {form.niches.map((n) => (
                  <Pill key={n} tone="brand">
                    {nicheLabel(n)}
                  </Pill>
                ))}
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 divide-x rounded-lg border text-center">
              <div className="p-2">
                <div className="font-display text-sm font-bold tabular-nums">{followersTotal ? compact(followersTotal) : "—"}</div>
                <div className="text-[11px] text-muted-foreground">Followers</div>
              </div>
              <div className="p-2">
                <div className="font-display text-sm font-bold tabular-nums">{engagementRate !== null ? pct(engagementRate) : "—"}</div>
                <div className="text-[11px] text-muted-foreground">Engagement</div>
              </div>
              <div className="p-2">
                <div className="font-display text-sm font-bold tabular-nums">{prices.length ? compact(Math.min(...prices)) : "—"}</div>
                <div className="text-[11px] text-muted-foreground">From ₹</div>
              </div>
            </div>
            {form.bio && <p className="mt-4 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{form.bio}</p>}
            {form.rateCard.some((r) => r.deliverable.trim()) && (
              <div className="mt-4 space-y-1 border-t pt-3">
                {form.rateCard
                  .filter((r) => r.deliverable.trim())
                  .slice(0, 4)
                  .map((r, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="truncate text-muted-foreground">{r.deliverable}</span>
                      <span className="font-medium tabular-nums">{r.price ? inr(Number(r.price)) : "—"}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Follower and engagement numbers come from Connect socials — they can&apos;t be edited here.</p>
      </aside>
    </div>
  )
}
