// Text embeddings for semantic matching (AI module 1 / 5).
//
// Production target is all-MiniLM-L6-v2 (384-dim) behind the FastAPI AI
// service; set AI_SERVICE_URL to use it. The local fallback is a feature-hashed
// bag of words + bigrams with niche synonym expansion — same dimensionality,
// deterministic, and good enough to rank creators before the model service ships.

export const EMBEDDING_DIM = 384

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have in into is it its of on or our that the their this to we with you your will who need needs looking want per each all any can more".split(
    " ",
  ),
)

const SYNONYMS: Record<string, string> = {
  style: "fashion", apparel: "fashion", clothing: "fashion", outfit: "fashion", streetwear: "fashion", ootd: "fashion",
  makeup: "beauty", skincare: "beauty", cosmetics: "beauty", grooming: "beauty", haircare: "beauty",
  gym: "fitness", workout: "fitness", health: "fitness", yoga: "fitness", nutrition: "fitness", wellness: "fitness",
  gadgets: "tech", technology: "tech", smartphone: "tech", software: "tech", ai: "tech", unboxing: "tech",
  recipes: "food", cooking: "food", restaurant: "food", foodie: "food", snacks: "food", beverage: "food",
  trip: "travel", tourism: "travel", hotel: "travel", wanderlust: "travel",
  investing: "finance", money: "finance", stocks: "finance", fintech: "finance", crypto: "finance",
  games: "gaming", esports: "gaming", gamer: "gaming", streaming: "gaming",
  parenting: "family", mom: "family", kids: "family", baby: "family",
  edtech: "education", learning: "education", study: "education", career: "education",
  reel: "reels", reels: "instagram", insta: "instagram", ig: "instagram", shorts: "youtube", yt: "youtube", vlog: "youtube",
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t))
}

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function localEmbed(text: string): number[] {
  const vec = new Array(EMBEDDING_DIM).fill(0)
  const toks = tokens(text)
  const add = (feature: string, weight: number) => {
    const h = hash(feature)
    vec[h % EMBEDDING_DIM] += (h & 1 ? 1 : -1) * weight
  }
  toks.forEach((t, i) => {
    add(t, 1)
    if (SYNONYMS[t]) add(SYNONYMS[t], 1.5)
    if (i > 0) add(`${toks[i - 1]}_${t}`, 0.5)
  })
  const norm = Math.hypot(...vec) || 1
  return vec.map((v) => v / norm)
}

export async function embed(text: string): Promise<number[]> {
  const url = process.env.AI_SERVICE_URL
  if (url) {
    try {
      const res = await fetch(`${url}/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (res.ok) return ((await res.json()) as { vector: number[] }).vector
    } catch {
      // fall through to local embedding
    }
  }
  return localEmbed(text)
}

export function cosine(a: number[] | null | undefined, b: number[] | null | undefined) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot // vectors are L2-normalised
}

export function creatorText(c: { headline: string; bio: string; niches: unknown; location: string; platforms: unknown }) {
  const niches = (c.niches as string[]) ?? []
  const platforms = ((c.platforms as { platform: string }[]) ?? []).map((p) => p.platform)
  return [c.headline, c.bio, niches.join(" "), niches.join(" "), platforms.join(" "), c.location].join(" ")
}

export function briefText(b: { title: string; description: string; niche: string; platforms: unknown; audience: string; location: string }) {
  return [b.title, b.description, b.niche, b.niche, ((b.platforms as string[]) ?? []).join(" "), b.audience, b.location].join(" ")
}
