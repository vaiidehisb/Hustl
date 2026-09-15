// End-to-end smoke test through the API gateway with real services and DB.
// Creates fresh brand + creator accounts and walks the full deal lifecycle.
//   node scripts/e2e-smoke.mjs            (gateway at http://localhost:4000)

const GW = process.env.GATEWAY_URL ?? "http://localhost:4000"
const rnd = Math.random().toString(36).slice(2, 8)
const PASSWORD = "Hustl-e2e-2026"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(method, path, body, token, { allowFail = false } = {}) {
  const res = await fetch(GW + path, {
    method,
    headers: { ...(body && { "content-type": "application/json" }), ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    console.error(`✗ ${method} ${path} → ${res.status}\n${JSON.stringify(json, null, 2)}`)
    if (allowFail) return null
    process.exit(1)
  }
  console.log(`✓ ${method} ${path} (${res.status})`)
  return json
}

async function waitFor(label, fn, timeoutMs = 30000) {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - start > timeoutMs) {
      console.error(`✗ timed out waiting for ${label}`)
      process.exit(1)
    }
    await sleep(1000)
  }
}

// ── Accounts & profiles ──
const brandReg = await call("POST", "/auth/register", { role: "BRAND", email: `brand.${rnd}@e2e.hustl.test`, password: PASSWORD, name: "Asha Brand", companyName: `E2E Skincare ${rnd}` })
const creatorReg = await call("POST", "/auth/register", { role: "CREATOR", email: `creator.${rnd}@e2e.hustl.test`, password: PASSWORD, name: "Kiran Creator", handle: `kiran_${rnd}` })
const B = brandReg.data.accessToken
const C = creatorReg.data.accessToken

await call("POST", "/auth/register", { role: "BRAND", email: `brand.${rnd}@e2e.hustl.test`, password: PASSWORD, name: "Dup", companyName: "Dup" }, null, { allowFail: true }).then((r) => r && process.exit(1))
const login = await call("POST", "/auth/login", { email: `creator.${rnd}@e2e.hustl.test`, password: PASSWORD })
const refreshed = await call("POST", "/auth/refresh", { refreshToken: login.data.refreshToken })

await call("PUT", "/creators/me", {
  headline: "Skincare for humid Indian summers",
  bio: "Dermatology-informed skincare reviews and SPF testing in Mumbai heat.",
  location: "Mumbai",
  niches: ["beauty", "lifestyle"],
  languages: ["English", "Hindi"],
  rateCard: [{ deliverable: "Instagram Reel", price: 25000 }],
  portfolio: [{ title: "SPF wear test", url: "https://instagram.com/p/example" }],
  available: true,
}, C)
await call("PUT", "/brands/me", { companyName: `E2E Skincare ${rnd}`, industry: "Beauty", website: "https://example.com", description: "SPF-first skincare.", location: "Mumbai" }, B)
await call("POST", "/social/accounts/self-reported", { platform: "INSTAGRAM", handle: `kiran_${rnd}`, followers: 82000, engagementRate: 4.6, avgViews: 41000 }, C)
const meCreator = await call("GET", "/users/me", null, C)
const creatorId = meCreator.data.creator.id
console.log(`  profile completion: ${meCreator.data.profileCompletion?.percent}%`)

// ── Brief (AI parse) → publish → marketplace → apply ──
const parsed = await call("POST", "/briefs/parse", { text: "We need 2 beauty creators on Instagram with 50K+ followers in Mumbai for our SPF launch. Budget ₹25K per creator, 1 Reel + 3 stories, posting in July." }, B, { allowFail: true })
console.log(`  parser source: ${parsed?.data?.source ?? "unavailable"}`)
const brief = await call("POST", "/briefs", {
  title: `SPF 50 launch ${rnd}`,
  description: "Show daily SPF reapplication in real Mumbai heat. Gel texture, no white cast.",
  requirements: "1 Reel + 3 stories, tag the brand",
  niche: "beauty",
  platforms: ["INSTAGRAM"],
  deliverables: [{ type: "Reel", quantity: 1 }, { type: "Story", quantity: 3 }],
  minFollowers: 50000,
  minEngagement: 0.02,
  budgetPerCreator: 25000,
  creatorsNeeded: 2,
  locations: ["Mumbai"],
  timeline: "July",
  audience: "Women 18-34",
  visibility: "OPEN",
}, B)
const briefId = brief.data.id
await call("POST", `/briefs/${briefId}/publish`, null, B)
const open = await call("GET", `/briefs/open?niche=beauty`, null, C)
console.log(`  open briefs visible to creator: ${open.data.items?.length ?? open.data.length}`)
const application = await call("POST", `/briefs/${briefId}/applications`, { pitch: "I test sunscreens outdoors every summer — my SPF reel hit 400K views.", proposedRate: 25000 }, C)
console.log(`  application score: ${application.data.matchScore} ${JSON.stringify(application.data.matchReasons)} (${application.meta?.aiScoring})`)
await call("PATCH", `/applications/${application.data.id}/status`, { status: "SHORTLISTED" }, B)
const matches = await call("GET", `/briefs/${briefId}/matches`, null, B, { allowFail: true })
console.log(`  AI matches: ${matches ? (matches.data.items ?? matches.data).length : "unavailable"}`)
const search = await call("GET", `/search/creators?niche=beauty`, null, B)
console.log(`  search engine: ${search.meta?.engine}, results: ${(search.data.items ?? search.data).length}`)

// ── Offer → counter → accept → contract → sign ──
const deal = await call("POST", "/deals", {
  creatorId,
  briefId,
  applicationId: application.data.id,
  title: `SPF 50 Reel ${rnd}`,
  amount: 30000,
  paymentMode: "MILESTONES",
  milestones: [{ title: "Script approval", percent: 30 }, { title: "Content live", percent: 70 }],
  deliverables: "1 Instagram Reel + 3 stories showing SPF reapplication",
  message: "Loved your pitch — here's our offer.",
}, B)
const dealId = deal.data.id
await call("POST", `/deals/${dealId}/counter`, { amount: 34000, milestones: [{ title: "Script approval", percent: 30 }, { title: "Content live", percent: 70 }], note: "Includes 30-day usage rights." }, C)
await call("POST", `/deals/${dealId}/accept`, null, B)
const contract = await call("GET", `/deals/${dealId}/contract`, null, C)
await call("POST", `/deals/${dealId}/contract/sign`, { signerName: "Kiran Creator", bodyHash: contract.data.bodyHash }, C)
await call("POST", `/deals/${dealId}/contract/sign`, { signerName: "Asha Brand" }, B)

// ── Escrow funding (test provider) ──
const intent = await call("POST", `/payments/deals/${dealId}/intent`, null, B)
const intentId = intent.data.intent.id
await call("POST", `/payments/intents/${intentId}/confirm-test`, null, B)
await waitFor("deal IN_PROGRESS", async () => (await call("GET", `/deals/${dealId}`, null, B)).data.status === "IN_PROGRESS" || null)

// ── Milestones: submit → approve → release ──
for (let i = 0; i < 2; i++) {
  const d = (await call("GET", `/deals/${dealId}`, null, C)).data
  const m = d.milestones.sort((a, b) => a.position - b.position)[i]
  await call("POST", `/deals/${dealId}/milestones/${m.id}/submit`, { url: `https://instagram.com/reel/e2e-${rnd}-${i}`, note: `Milestone ${i + 1} delivered` }, C)
  await call("POST", `/deals/${dealId}/milestones/${m.id}/approve`, null, B)
}
const done = await waitFor("deal COMPLETED", async () => {
  const d = (await call("GET", `/deals/${dealId}`, null, B)).data
  return d.status === "COMPLETED" ? d : null
})
console.log(`  milestones: ${done.milestones.map((m) => `${m.title}=${m.status}`).join(", ")}`)
const escrow = await call("GET", `/payments/deals/${dealId}`, null, B)
console.log(`  escrow: ${JSON.stringify(escrow.data.escrow ?? escrow.data.summary ?? {})}`)
const payouts = await call("GET", "/payments/me/payouts", null, C)
console.log(`  creator payouts: ${(payouts.data.items ?? payouts.data).length}`)
await call("POST", `/deals/${dealId}/reviews`, { rating: 5, comment: "Smooth collaboration, on time." }, B)

// ── Messaging & notifications ──
const convs = await waitFor("conversation created", async () => {
  const r = await call("GET", "/conversations", null, C)
  const list = r.data.items ?? r.data
  return list.length ? list : null
})
await call("POST", `/conversations/${convs[0].id}/messages`, { body: "Thanks for the smooth deal!" }, C)
const unread = await call("GET", "/conversations/unread-count", null, B)
console.log(`  brand unread messages: ${JSON.stringify(unread.data)}`)
const notifs = await waitFor("notifications", async () => {
  const r = await call("GET", "/notifications", null, C)
  const list = r.data.items ?? r.data
  return list.length ? list : null
})
console.log(`  creator notifications: ${notifs.length} (latest: ${notifs[0].title})`)

// ── Analytics & scores ──
const bo = await call("GET", "/analytics/brand/overview", null, B)
console.log(`  brand spend: ${bo.data.totalSpend ?? JSON.stringify(bo.data).slice(0, 120)}`)
const co = await call("GET", "/analytics/creator/overview", null, C)
console.log(`  creator overview keys: ${Object.keys(co.data).join(",")}`)
const metrics = await call("GET", `/social/creators/${creatorId}/metrics`, null, B)
console.log(`  creator score: ${JSON.stringify(metrics.data.score)}`)

// ── Negative checks ──
await call("GET", "/internal/users/x", null, B, { allowFail: true }).then((r) => r && (console.error("internal route exposed"), process.exit(1)))
await call("GET", `/deals/${dealId}`, null, refreshed.data.accessToken).then(() => {})
console.log("\nE2E smoke test passed ✅")
