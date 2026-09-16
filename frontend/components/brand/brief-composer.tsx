"use client"

// Describe a campaign in plain words → POST /briefs/parse (Claude, or the rule
// parser when Claude isn't configured) → review every field → POST /briefs.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertCircle, ArrowLeft, Bot, Loader2, PenLine, Plus, Send, Sparkles, Trash2, Wand2 } from "lucide-react"
import type { BriefStatus, CreateBriefRequest, SocialPlatform } from "@hustl/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBriefAction, parseBriefAction, updateBriefAction, type ActionResult } from "@/app/actions/brand"
import { inr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { cap, dateToIso, NICHES, parserSourceLabel, PLATFORM_LABEL, PLATFORMS, type ParseConfidence, type ParsedBriefResult } from "./helpers"

const EXAMPLES = [
  "Launching our vegan protein bar in Mumbai and Bengaluru in October. Need 5 fitness creators with 20K+ followers on Instagram for 2 reels and 3 stories each. Budget ₹30K per creator. Audience: 18–30 gym-goers.",
  "Looking for 3 tech YouTubers to review our new noise-cancelling earbuds — one 8–10 min video each, plus a Short. 100K+ subscribers, budget 1.5L per creator, go live by mid November.",
  "Skincare brand for Indian summers. Want beauty creators on Instagram for a 'get ready with me' reel featuring our SPF 50 sunscreen. Micro creators welcome, ₹12K each, women 20–35 across tier-2 cities.",
]

type FieldKey =
  | "title"
  | "niche"
  | "platforms"
  | "deliverables"
  | "audience"
  | "budgetPerCreator"
  | "creatorsNeeded"
  | "deadline"
  | "timeline"
  | "requirements"
  | "locations"
  | "minFollowers"

/** confidence key from the AI parser → the form field it fills. */
const CONF_MAP: Record<string, FieldKey> = {
  title: "title",
  niche: "niche",
  platforms: "platforms",
  deliverables: "deliverables",
  audience: "audience",
  budget: "budgetPerCreator",
  creators_needed: "creatorsNeeded",
  deadline: "deadline",
  timeline: "timeline",
  requirements: "requirements",
  location: "locations",
  min_followers: "minFollowers",
}

export type BriefFormValues = {
  title: string
  description: string
  requirements: string
  niche: string
  platforms: SocialPlatform[]
  deliverables: { type: string; quantity: number }[]
  minFollowers: string
  minEngagementPct: string
  budgetPerCreator: string
  creatorsNeeded: string
  locations: string
  timeline: string
  audience: string
  deadline: string
}

const empty: BriefFormValues = {
  title: "",
  description: "",
  requirements: "",
  niche: "",
  platforms: [],
  deliverables: [{ type: "Reel", quantity: 1 }],
  minFollowers: "",
  minEngagementPct: "",
  budgetPerCreator: "",
  creatorsNeeded: "1",
  locations: "",
  timeline: "",
  audience: "",
  deadline: "",
}

export function BriefComposer({ briefId, initial, status }: { briefId?: string; initial?: BriefFormValues; status?: BriefStatus }) {
  const router = useRouter()
  const editing = !!briefId
  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1)
  const [text, setText] = useState("")
  const [parsing, startParse] = useTransition()
  const [saving, startSave] = useTransition()
  const [savingMode, setSavingMode] = useState<"draft" | "publish" | null>(null)
  const [parsed, setParsed] = useState<ParsedBriefResult | null>(null)
  const [lowConf, setLowConf] = useState<Set<FieldKey>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [f, setF] = useState<BriefFormValues>(initial ?? empty)

  const update = <K extends keyof BriefFormValues>(key: K, value: BriefFormValues[K], conf?: FieldKey) => {
    setF((s) => ({ ...s, [key]: value }))
    setErrors(({ [key as string]: _drop, ...rest }) => rest)
    if (conf && lowConf.has(conf)) setLowConf((s) => new Set([...s].filter((x) => x !== conf)))
  }

  function parse() {
    startParse(async () => {
      const res = await parseBriefAction(text)
      if (!res.ok) {
        toast.error(res.error.message, {
          description:
            res.error.code === "INTEGRATION_UNAVAILABLE" || res.error.code === "SERVICE_UNAVAILABLE"
              ? "AI parsing is unavailable — you can still fill the brief in manually."
              : undefined,
        })
        return
      }
      const p = res.data
      setParsed(p)
      setF({
        title: p.title || "",
        description: text.trim(),
        requirements: (p.requirements ?? []).join("\n"),
        niche: p.niche?.[0] && NICHES.includes(p.niche[0]) ? p.niche[0] : "",
        platforms: p.platforms ?? [],
        deliverables: p.deliverables?.length ? p.deliverables : [{ type: "", quantity: 1 }],
        minFollowers: p.min_followers ? String(p.min_followers) : "",
        minEngagementPct: "",
        budgetPerCreator: p.budget?.per_creator ? String(p.budget.per_creator) : "",
        creatorsNeeded: String(p.creators_needed || 1),
        locations: (p.location ?? []).join(", "),
        timeline: p.timeline ?? "",
        audience: (p.audience ?? []).join(", "),
        deadline: p.deadline ?? "",
      })
      const low = new Set<FieldKey>()
      for (const [k, v] of Object.entries(p.confidence ?? {}) as [string, ParseConfidence][]) if (v === "low" && CONF_MAP[k]) low.add(CONF_MAP[k])
      setLowConf(low)
      setErrors({})
      setStep(2)
      toast.success(low.size ? `Brief parsed — ${low.size} field${low.size === 1 ? "" : "s"} to double-check` : "Brief parsed")
    })
  }

  function toRequest(): CreateBriefRequest {
    return {
      title: f.title.trim(),
      description: f.description.trim(),
      requirements: f.requirements.trim(),
      niche: f.niche.trim().toLowerCase(),
      platforms: f.platforms,
      deliverables: f.deliverables.filter((d) => d.type.trim()).map((d) => ({ type: d.type.trim(), quantity: Math.max(1, Math.round(d.quantity) || 1) })),
      minFollowers: Math.max(0, Math.round(Number(f.minFollowers) || 0)),
      minEngagement: Math.min(1, Math.max(0, (Number(f.minEngagementPct) || 0) / 100)),
      budgetPerCreator: Math.round(Number(f.budgetPerCreator) || 0),
      creatorsNeeded: Math.max(1, Math.round(Number(f.creatorsNeeded) || 1)),
      locations: f.locations
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      timeline: f.timeline.trim(),
      audience: f.audience.trim(),
      visibility: "OPEN",
      deadline: dateToIso(f.deadline),
      parsed: parsed ? (parsed as unknown as Record<string, unknown>) : null,
    }
  }

  function save(publish: boolean) {
    setSavingMode(publish ? "publish" : "draft")
    startSave(async () => {
      const body = toRequest()
      const res: ActionResult<{ id: string; status: string }> = editing ? await updateBriefAction(briefId!, body, publish) : await createBriefAction(body, publish)
      setSavingMode(null)
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {})
        toast.error(res.error.message, {
          description:
            res.error.code === "SERVICE_UNAVAILABLE" || res.error.code === "TIMEOUT"
              ? "The brief service didn't respond — nothing was saved."
              : res.error.code === "CONFLICT"
                ? "Reload the brief and try again."
                : undefined,
        })
        return
      }
      toast.success(editing ? (publish ? "Brief published" : "Changes saved") : publish ? "Brief is live — matching creators now" : "Draft saved")
      router.push(`/brand/briefs/${res.data.id}`)
      router.refresh()
    })
  }

  if (step === 1) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-gradient text-white">
              <Wand2 className="size-4" />
            </span>
            <div>
              <Label htmlFor="brief-text" className="text-base font-semibold">
                Describe your campaign in plain words
              </Label>
              <p className="text-xs text-muted-foreground">Product, who you want, platforms, deliverables, budget, timing — whatever you know.</p>
            </div>
          </div>
          <Textarea
            id="brief-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            className="mt-4 resize-y text-[15px] leading-relaxed"
            placeholder="We're launching… and need… creators on… with… followers. Budget is… per creator, going live in…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim().length >= 20) parse()
            }}
          />
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Try an example</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setText(ex)}
                  className="max-w-full truncate rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:max-w-[260px]"
                  title={ex}
                >
                  {ex.slice(0, 48)}…
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setStep(2)} disabled={parsing}>
              <PenLine /> Skip AI, fill in manually
            </Button>
            <Button onClick={parse} disabled={parsing || text.trim().length < 20} size="lg">
              {parsing ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {parsing ? "Parsing…" : "Parse with AI"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">You'll review and edit every field before anything goes live.</p>
      </div>
    )
  }

  const busy = saving
  const lc = (k: FieldKey) => lowConf.has(k)

  return (
    <form
      className="mx-auto max-w-3xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        save(true)
      }}
    >
      {!editing && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)} className="self-start">
            <ArrowLeft /> Back to description
          </Button>
          {parsed && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground">
                <Bot className="size-3.5" /> {parserSourceLabel(parsed.source)}
              </span>
              {lowConf.size > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 font-medium text-warning">
                  <AlertCircle className="size-3.5" /> {lowConf.size} to check
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {errors._form && <p className="rounded-lg border border-destructive/30 bg-danger-soft px-4 py-3 text-sm text-destructive">{errors._form}</p>}

      <Section title="Campaign">
        <Field label="Title" htmlFor="b-title" className="sm:col-span-2" low={lc("title")} error={errors.title}>
          <Input id="b-title" value={f.title} onChange={(e) => update("title", e.target.value, "title")} maxLength={140} required placeholder="Protein bar launch — fitness creators" />
        </Field>
        <Field label="Description" htmlFor="b-desc" className="sm:col-span-2" hint="Creators see this when deciding to apply." error={errors.description}>
          <Textarea id="b-desc" rows={5} value={f.description} onChange={(e) => update("description", e.target.value)} required minLength={10} />
        </Field>
        <Field label="Niche" low={lc("niche")} error={errors.niche}>
          <Select value={f.niche || "any"} onValueChange={(v) => update("niche", v === "any" ? "" : v, "niche")}>
            <SelectTrigger className={cn("w-full", lc("niche") && ringLow)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any niche</SelectItem>
              {NICHES.map((n) => (
                <SelectItem key={n} value={n}>
                  {cap(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Platforms" low={lc("platforms")} error={errors.platforms}>
          <div className={cn("flex flex-wrap gap-1.5 rounded-md", lc("platforms") && `p-1 ${ringLow}`)}>
            {PLATFORMS.map((p) => {
              const on = f.platforms.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => update("platforms", on ? f.platforms.filter((x) => x !== p) : [...f.platforms, p], "platforms")}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PLATFORM_LABEL[p]}
                </button>
              )
            })}
          </div>
        </Field>
      </Section>

      <Section title="Deliverables">
        <div className={cn("space-y-2 sm:col-span-2", lc("deliverables") && `rounded-lg p-2 ${ringLow}`)}>
          {f.deliverables.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                aria-label="Quantity"
                value={d.quantity || ""}
                onChange={(e) => update("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)), "deliverables")}
                className="w-20 tabular-nums"
              />
              <span className="text-muted-foreground">×</span>
              <Input
                aria-label="Deliverable type"
                list="deliverable-types"
                value={d.type}
                placeholder="Reel, Story, YouTube video…"
                onChange={(e) => update("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)), "deliverables")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove deliverable"
                disabled={f.deliverables.length <= 1}
                onClick={() => update("deliverables", f.deliverables.filter((_, j) => j !== i), "deliverables")}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <datalist id="deliverable-types">
            {["Reel", "Story", "Post", "Carousel", "YouTube video", "Short", "LinkedIn post", "Live stream"].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => update("deliverables", [...f.deliverables, { type: "", quantity: 1 }], "deliverables")}>
              <Plus /> Add deliverable
            </Button>
            {lc("deliverables") && <CheckHint />}
          </div>
          {errors.deliverables && <p className="text-xs font-medium text-destructive">{errors.deliverables}</p>}
        </div>
      </Section>

      <Section title="Creator requirements">
        <Field label="Minimum followers" htmlFor="b-minf" low={lc("minFollowers")} error={errors.minFollowers}>
          <Input
            id="b-minf"
            type="number"
            min={0}
            step={1000}
            value={f.minFollowers}
            onChange={(e) => update("minFollowers", e.target.value, "minFollowers")}
            placeholder="0 = any"
            className={cn(lc("minFollowers") && ringLow)}
          />
        </Field>
        <Field label="Minimum engagement rate (%)" htmlFor="b-er" hint="Stored as a fraction — 2.5% is sent as 0.025." error={errors.minEngagement}>
          <Input id="b-er" type="number" min={0} max={100} step={0.1} value={f.minEngagementPct} onChange={(e) => update("minEngagementPct", e.target.value)} placeholder="e.g. 2.5" />
        </Field>
        <Field label="Locations" htmlFor="b-loc" low={lc("locations")} hint="Comma separated, e.g. Mumbai, Pune" error={errors.locations}>
          <Input id="b-loc" value={f.locations} onChange={(e) => update("locations", e.target.value, "locations")} placeholder="Pan-India, or e.g. Mumbai" className={cn(lc("locations") && ringLow)} />
        </Field>
        <Field label="Target audience" htmlFor="b-aud" low={lc("audience")} error={errors.audience}>
          <Input id="b-aud" value={f.audience} onChange={(e) => update("audience", e.target.value, "audience")} placeholder="e.g. Women 20–35, tier-2 cities" />
        </Field>
        <Field label="Requirements" htmlFor="b-req" className="sm:col-span-2" low={lc("requirements")} hint="Anything a creator must agree to — usage rights, disclosure, exclusivity." error={errors.requirements}>
          <Textarea id="b-req" rows={3} value={f.requirements} onChange={(e) => update("requirements", e.target.value, "requirements")} placeholder="1 Reel + 3 stories, tag the brand, 30-day usage rights" />
        </Field>
      </Section>

      <Section title="Budget & timing">
        <Field
          label="Budget per creator (₹)"
          htmlFor="b-budget"
          low={lc("budgetPerCreator")}
          error={errors.budgetPerCreator}
          hint={Number(f.budgetPerCreator) > 0 && Number(f.creatorsNeeded) > 0 ? `≈ ${inr(Number(f.budgetPerCreator) * Number(f.creatorsNeeded))} total before fees` : undefined}
        >
          <Input
            id="b-budget"
            type="number"
            min={1}
            step={500}
            value={f.budgetPerCreator}
            onChange={(e) => update("budgetPerCreator", e.target.value, "budgetPerCreator")}
            placeholder="25000"
            className={cn(lc("budgetPerCreator") && ringLow)}
          />
        </Field>
        <Field label="Creators needed" htmlFor="b-count" low={lc("creatorsNeeded")} error={errors.creatorsNeeded}>
          <Input id="b-count" type="number" min={1} max={1000} value={f.creatorsNeeded} onChange={(e) => update("creatorsNeeded", e.target.value, "creatorsNeeded")} />
        </Field>
        <Field label="Timeline" htmlFor="b-time" low={lc("timeline")} error={errors.timeline}>
          <Input id="b-time" value={f.timeline} onChange={(e) => update("timeline", e.target.value, "timeline")} placeholder="e.g. Mid October" className={cn(lc("timeline") && ringLow)} />
        </Field>
        <Field label="Application deadline" htmlFor="b-deadline" low={lc("deadline")} error={errors.deadline}>
          <Input id="b-deadline" type="date" value={f.deadline} min={new Date().toISOString().slice(0, 10)} onChange={(e) => update("deadline", e.target.value, "deadline")} />
        </Field>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t bg-background/90 px-4 py-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-xl sm:border sm:px-5">
        {(!editing || status === "DRAFT") && (
          <Button type="button" variant="outline" onClick={() => save(false)} disabled={busy}>
            {savingMode === "draft" && <Loader2 className="animate-spin" />}
            {editing ? "Save draft" : "Save as draft"}
          </Button>
        )}
        {editing && status !== "DRAFT" ? (
          <Button type="button" onClick={() => save(false)} disabled={busy}>
            {savingMode === "draft" && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        ) : (
          <Button type="submit" disabled={busy}>
            {savingMode === "publish" ? <Loader2 className="animate-spin" /> : <Send />}
            Publish brief
          </Button>
        )}
      </div>
    </form>
  )
}

const ringLow = "ring-2 ring-warning/60 ring-offset-1 ring-offset-background"

function CheckHint() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
      <AlertCircle className="size-3" /> Check this
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  low,
  error,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  low?: boolean
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {low && <CheckHint />}
      </div>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
