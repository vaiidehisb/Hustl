// AI module 3 — brief parser. Uses Claude structured output when
// ANTHROPIC_API_KEY is configured; otherwise a deterministic rule-based parser
// so the "auto-fill" flow still works in local dev.

import Anthropic from "@anthropic-ai/sdk"

export type Confidence = "high" | "medium" | "low"
export type ParsedBrief = {
  title: string
  campaign_niche: string
  required_platforms: string[]
  deliverables: { type: string; quantity: number }[]
  min_followers: number
  budget_per_creator: number
  creators_needed: number
  campaign_location: string
  campaign_timeline: string
  audience_target: string
  confidence: Record<string, Confidence>
  source: "claude" | "rules"
}

const NICHES = ["fashion", "beauty", "fitness", "tech", "food", "travel", "finance", "gaming", "education", "family", "lifestyle"]
const PLATFORMS = ["instagram", "youtube", "linkedin", "tiktok", "x"]

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "campaign_niche", "required_platforms", "deliverables", "min_followers", "budget_per_creator",
    "creators_needed", "campaign_location", "campaign_timeline", "audience_target", "confidence",
  ],
  properties: {
    title: { type: "string", description: "Short campaign title, max 8 words" },
    campaign_niche: { type: "string", enum: NICHES },
    required_platforms: { type: "array", items: { type: "string", enum: PLATFORMS } },
    deliverables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "quantity"],
        properties: { type: { type: "string", description: "e.g. Reel, Story, YouTube video, Short, Post" }, quantity: { type: "integer" } },
      },
    },
    min_followers: { type: "integer", description: "0 if not stated" },
    budget_per_creator: { type: "integer", description: "INR per creator, 0 if not stated" },
    creators_needed: { type: "integer" },
    campaign_location: { type: "string" },
    campaign_timeline: { type: "string" },
    audience_target: { type: "string" },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["campaign_niche", "required_platforms", "deliverables", "min_followers", "budget_per_creator", "campaign_location", "campaign_timeline"],
      properties: Object.fromEntries(
        ["campaign_niche", "required_platforms", "deliverables", "min_followers", "budget_per_creator", "campaign_location", "campaign_timeline"].map((k) => [
          k,
          { type: "string", enum: ["high", "medium", "low"] },
        ]),
      ),
    },
  },
} as const

async function parseWithClaude(text: string): Promise<ParsedBrief | null> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: process.env.BRIEF_PARSER_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 2000,
    temperature: 0,
    system:
      "You extract structured campaign parameters from an influencer-marketing brief written by a brand. Amounts are in Indian rupees (₹30K = 30000, 1L = 100000). Mark a field 'low' confidence when it is inferred rather than stated, and 'high' when stated explicitly.",
    messages: [{ role: "user", content: text }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming)
  const block = response.content.find((b) => b.type === "text")
  if (response.stop_reason !== "end_turn" || !block || block.type !== "text") return null
  return { ...(JSON.parse(block.text) as Omit<ParsedBrief, "source">), source: "claude" }
}

function amount(raw: string, unit?: string) {
  const n = parseFloat(raw.replace(/,/g, ""))
  const u = unit?.toLowerCase()
  if (u === "k") return n * 1_000
  if (u === "l" || u === "lakh" || u === "lac") return n * 100_000
  if (u === "m") return n * 1_000_000
  return n
}

export function parseWithRules(text: string): ParsedBrief {
  const t = text.toLowerCase()
  const confidence: Record<string, Confidence> = {}

  const niche = NICHES.find((n) => t.includes(n)) ?? (/(skincare|makeup)/.test(t) ? "beauty" : /(gym|workout)/.test(t) ? "fitness" : /(gadget|app|saas)/.test(t) ? "tech" : "lifestyle")
  confidence.campaign_niche = NICHES.some((n) => t.includes(n)) ? "high" : "low"

  const platforms = PLATFORMS.filter((p) => t.includes(p) || (p === "instagram" && /\b(reel|story|stories|insta|ig)\b/.test(t)) || (p === "youtube" && /\b(shorts?|yt)\b/.test(t)))
  confidence.required_platforms = platforms.length ? "high" : "low"

  const deliverables: { type: string; quantity: number }[] = []
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 }
  for (const [re, type] of [
    [/(\d+|a|an|one|two|three|four|five)\s+reels?/, "Reel"],
    [/(\d+|a|an|one|two|three|four|five)\s+stor(?:y|ies)/, "Story"],
    [/(\d+|a|an|one|two|three|four|five)\s+(?:youtube\s+)?videos?/, "YouTube video"],
    [/(\d+|a|an|one|two|three|four|five)\s+shorts?/, "Short"],
    [/(\d+|a|an|one|two|three|four|five)\s+posts?/, "Post"],
  ] as [RegExp, string][]) {
    const m = t.match(re)
    if (m) deliverables.push({ type, quantity: words[m[1]] ?? parseInt(m[1]) })
  }
  confidence.deliverables = deliverables.length ? "high" : "low"

  const f = t.match(/(\d+(?:\.\d+)?)\s*(k|m|l|lakh)?\+?\s*followers/)
  const min_followers = f ? amount(f[1], f[2]) : 0
  confidence.min_followers = f ? "high" : "low"

  const b = t.match(/(?:budget|₹|rs\.?|inr)\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh|lac|m)?/)
  const budget_per_creator = b ? amount(b[1], b[2]) : 0
  confidence.budget_per_creator = b ? (/per creator|each/.test(t) ? "high" : "medium") : "low"

  const n = t.match(/(\d+|two|three|four|five)\s+(?:\w+\s+)?(?:creators|influencers)/)
  const creators_needed = n ? (words[n[1]] ?? parseInt(n[1])) : 1

  const loc = text.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s*(?:,|and)\s*[A-Z][a-zA-Z]+)*)/)
  confidence.campaign_location = loc ? "medium" : "low"

  const months = "january|february|march|april|may|june|july|august|september|october|november|december"
  const time = t.match(new RegExp(`(?:in|by|during|before)\\s+((?:early |mid |late )?(?:${months})(?:\\s+\\d{4})?|next (?:week|month)|\\d+\\s+weeks?)`))
  confidence.campaign_timeline = time ? "high" : "low"

  const firstSentence = text.split(/[.!?\n]/)[0].trim()
  return {
    title: firstSentence.length > 60 ? `${niche[0].toUpperCase()}${niche.slice(1)} creator campaign` : firstSentence || "New campaign",
    campaign_niche: niche,
    required_platforms: platforms,
    deliverables,
    min_followers,
    budget_per_creator,
    creators_needed,
    campaign_location: loc?.[1] ?? "",
    campaign_timeline: time?.[1] ?? "",
    audience_target: t.match(/(?:audience|targeting|target)\s+(?:of\s+)?([^.]+)/)?.[1]?.trim() ?? "",
    confidence,
    source: "rules",
  }
}

export async function parseBrief(text: string): Promise<ParsedBrief> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const parsed = await parseWithClaude(text)
      if (parsed) return parsed
    } catch (err) {
      console.error("[brief-parser] Claude parse failed, using rules", err)
    }
  }
  return parseWithRules(text)
}
