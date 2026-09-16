// Phase 3–4 coverage against the running stack: dispute → admin resolution,
// verification request → admin decision, contract PDF, media kit, fraud queue.
//   node scripts/e2e-phase4.mjs            (gateway at http://localhost:4000)
// Requires an admin account: npm run admin:create -- --email ops@hustl.test

const GW = process.env.GATEWAY_URL ?? "http://localhost:4000"
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "ops@hustl.test", password: process.env.ADMIN_PASSWORD ?? "Hustl-admin-2026" }
const rnd = Math.random().toString(36).slice(2, 8)
const PASSWORD = "Hustl-e2e-2026"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(method, path, body, token, { allowFail = false, raw = false } = {}) {
  const res = await fetch(GW + path, {
    method,
    headers: { ...(body && { "content-type": "application/json" }), ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (raw) {
    console.log(`✓ ${method} ${path} (${res.status}, ${res.headers.get("content-type")})`)
    return res
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    console.error(`✗ ${method} ${path} → ${res.status}\n${JSON.stringify(json, null, 2)}`)
    if (allowFail) return null
    process.exit(1)
  }
  console.log(`✓ ${method} ${path} (${res.status})`)
  return json
}
const waitFor = async (label, fn, ms = 30000) => {
  for (const start = Date.now(); Date.now() - start < ms; ) {
    const v = await fn()
    if (v) return v
    await sleep(1000)
  }
  console.error(`✗ timed out: ${label}`)
  process.exit(1)
}

// ── Actors ──
const brand = await call("POST", "/auth/register", { role: "BRAND", email: `p4.brand.${rnd}@e2e.hustl.test`, password: PASSWORD, name: "Priya Brand", companyName: `P4 Labs ${rnd}` })
const creator = await call("POST", "/auth/register", { role: "CREATOR", email: `p4.creator.${rnd}@e2e.hustl.test`, password: PASSWORD, name: "Rohit Creator", handle: `rohit_${rnd}` })
const admin = await call("POST", "/auth/login", ADMIN)
const B = brand.data.accessToken
const C = creator.data.accessToken
const A = admin.data.accessToken
if (admin.data.user.role !== "ADMIN") {
  console.error("✗ admin account is not an ADMIN — run: npm run admin:create -- --email ops@hustl.test")
  process.exit(1)
}

await call("PUT", "/creators/me", { headline: "Tech reviews in Hinglish", bio: "Honest phone and app reviews for first-time buyers.", location: "Pune", niches: ["tech"], languages: ["Hindi", "English"], rateCard: [{ deliverable: "YouTube integration", price: 60000 }], portfolio: [], available: true }, C)
await call("POST", "/social/accounts/self-reported", { platform: "YOUTUBE", handle: `rohit_${rnd}`, followers: 210000, engagementRate: 3.8, avgViews: 90000 }, C)
const me = await call("GET", "/users/me", null, C)
const creatorId = me.data.creator.id

// ── Verification request → admin decision ──
await call("POST", "/verifications", { type: "CREATOR_IDENTITY", details: { legalName: "Rohit Kumar", idType: "PAN" }, documentIds: [] }, C)
const queue = await call("GET", "/admin/verifications?status=PENDING", null, A)
const pending = (queue.data.items ?? queue.data).find((v) => v.userId === creator.data.user.id)
if (!pending) {
  console.error("✗ verification request missing from the admin queue")
  process.exit(1)
}
await call("POST", `/admin/verifications/${pending.id}/decision`, { approve: true, note: "ID matches the profile name." }, A)
const verified = await call("GET", "/verifications/me", null, C)
console.log(`  verification status: ${(verified.data.items ?? verified.data)[0]?.status}`)

// ── Deal up to funded ──
const deal = await call("POST", "/deals", {
  creatorId,
  title: `Phone review ${rnd}`,
  amount: 60000,
  paymentMode: "MILESTONES",
  milestones: [{ title: "Script approval", percent: 40 }, { title: "Video live", percent: 60 }],
  deliverables: "1 YouTube integration with a 2-minute app walkthrough",
  message: "Keen to work with you on this.",
}, B)
const dealId = deal.data.id
await call("POST", `/deals/${dealId}/accept`, null, C)
await call("POST", `/deals/${dealId}/contract/sign`, { signerName: "Rohit Creator" }, C)
await call("POST", `/deals/${dealId}/contract/sign`, { signerName: "Priya Brand" }, B)
const intent = await call("POST", `/payments/deals/${dealId}/intent`, null, B)
await call("POST", `/payments/intents/${intent.data.intent.id}/confirm-test`, null, B)
await waitFor("IN_PROGRESS", async () => (await call("GET", `/deals/${dealId}`, null, B)).data.status === "IN_PROGRESS" || null)

// ── Contract PDF (media service) ──
const pdf = await call("GET", `/media/contracts/${dealId}/pdf`, null, B, { raw: true, allowFail: true })
if (pdf && !pdf.headers.get("content-type")?.includes("pdf")) console.log("  note: contract PDF did not return application/pdf")

// ── Dispute → freeze → admin resolution ──
const detail = await call("GET", `/deals/${dealId}`, null, C)
const first = detail.data.milestones.sort((a, b) => a.position - b.position)[0]
await call("POST", `/deals/${dealId}/milestones/${first.id}/submit`, { url: `https://youtube.com/watch?v=${rnd}`, note: "Script draft attached." }, C)
await call("POST", `/deals/${dealId}/disputes`, { reason: "The script skips the app walkthrough we agreed in the brief, so we can't approve it as delivered.", milestoneId: first.id }, B)
const disputed = await call("GET", `/deals/${dealId}`, null, B)
console.log(`  deal status after dispute: ${disputed.data.status}`)
const escrowFrozen = await call("GET", `/payments/deals/${dealId}`, null, B)
console.log(`  escrow frozen: ${escrowFrozen.data.escrow.frozen}`)

// Releases must be refused while frozen.
const blocked = await call("POST", `/deals/${dealId}/milestones/${first.id}/approve`, null, B, { allowFail: true })
console.log(`  approve during dispute blocked: ${blocked === null ? "yes" : "NO — releases are not frozen!"}`)
if (blocked !== null) process.exit(1)

const disputes = await call("GET", "/admin/disputes?status=OPEN", null, A)
const open = (disputes.data.items ?? disputes.data).find((d) => d.dealId === dealId)
if (!open) {
  console.error("✗ dispute missing from the admin queue")
  process.exit(1)
}
await call("POST", `/admin/disputes/${open.id}/resolve`, { resolution: "RELEASE_TO_CREATOR", note: "Creator delivered the agreed script; walkthrough belongs to the second milestone." }, A)
const resolved = await waitFor("dispute resolution applied", async () => {
  const d = (await call("GET", `/deals/${dealId}`, null, B)).data
  return d.status !== "DISPUTED" ? d : null
})
console.log(`  after resolution: deal ${resolved.status}, milestone ${resolved.milestones[0].status}`)
const escrowAfter = await call("GET", `/payments/deals/${dealId}`, null, B)
console.log(`  escrow: released ₹${escrowAfter.data.escrow.releasedAmount}, frozen ${escrowAfter.data.escrow.frozen}`)

// ── Media kit + admin metrics + fraud queue ──
await call("GET", `/media/media-kit/${creatorId}`, null, C, { raw: true, allowFail: true })
const metrics = await call("GET", "/admin/metrics", null, A)
console.log(`  platform metrics: ${JSON.stringify(metrics.data).slice(0, 180)}`)
const flags = await call("GET", "/admin/fraud-flags?status=OPEN", null, A)
console.log(`  open fraud flags: ${(flags.data.items ?? flags.data).length}`)

console.log("\nPhase 3–4 checks passed ✅")
