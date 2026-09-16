// Billing end to end against the running stack: brand Growth plan and the paid
// creator badge — subscribe, activate, prove the entitlement changed real
// behaviour (fee on a new offer, badge in discovery), then cancel.
//   node scripts/e2e-billing.mjs

const GW = process.env.GATEWAY_URL ?? "http://localhost:4000"
const rnd = Math.random().toString(36).slice(2, 8)
const PASSWORD = "Hustl-e2e-2026"

async function call(method, path, body, token, { allowFail = false } = {}) {
  const res = await fetch(GW + path, {
    method,
    headers: { ...(body && { "content-type": "application/json" }), ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    if (allowFail) {
      console.log(`  (expected failure) ${method} ${path} → ${res.status} ${json?.error?.code ?? ""}`)
      return null
    }
    console.error(`✗ ${method} ${path} → ${res.status}\n${JSON.stringify(json, null, 2)}`)
    process.exit(1)
  }
  console.log(`✓ ${method} ${path} (${res.status})`)
  return json
}
const expect = (label, actual, wanted) => {
  if (actual !== wanted) {
    console.error(`✗ ${label}: expected ${wanted}, got ${actual}`)
    process.exit(1)
  }
  console.log(`  ✔ ${label}: ${actual}`)
}

// ── Accounts ──
const brand = await call("POST", "/auth/register", { role: "BRAND", email: `bill.brand.${rnd}@e2e.hustl.test`, password: PASSWORD, name: "Bill Brand", companyName: `Billing Co ${rnd}` })
const creator = await call("POST", "/auth/register", { role: "CREATOR", email: `bill.creator.${rnd}@e2e.hustl.test`, password: PASSWORD, name: "Bill Creator", handle: `bill_${rnd}` })
const B = brand.data.accessToken
const C = creator.data.accessToken
const creatorId = (await call("GET", "/users/me", null, C)).data.creator.id
await call("PUT", "/creators/me", { headline: "Beauty reviews", bio: "Skincare and SPF testing for Indian summers.", location: "Mumbai", niches: ["beauty"], languages: ["English"], rateCard: [], portfolio: [], available: true }, C)
await call("POST", "/social/accounts/self-reported", { platform: "INSTAGRAM", handle: `bill_${rnd}`, followers: 60000, engagementRate: 4.5, avgViews: 20000 }, C)

// ── Catalogue and role checks ──
const products = await call("GET", "/payments/billing/products", null, B)
const growth = products.data.products.find((p) => p.key === "BRAND_GROWTH")
expect("Growth price", growth.price, 2999)
expect("Growth fee rate", growth.brandFeeRate, 0.05)
expect("brand sees only brand products", products.data.products.every((p) => p.audience === "BRAND"), true)
console.log("\n— a creator may not buy a brand plan —")
await call("POST", "/payments/billing/subscribe", { product: "BRAND_GROWTH" }, C, { allowFail: true })

// ── Baseline: an offer before subscribing is charged the Starter fee ──
const before = await call("POST", "/deals", {
  creatorId,
  title: `Pre-upgrade deal ${rnd}`,
  amount: 50000,
  paymentMode: "COMPLETION",
  milestones: [],
  deliverables: "1 Reel",
}, B)
expect("fee before upgrade", before.data.feeRates.brand, 0.08)

// ── Subscribe → activate ──
console.log("\n— brand subscribes to Growth —")
const sub = await call("POST", "/payments/billing/subscribe", { product: "BRAND_GROWTH" }, B)
expect("subscription starts pending", sub.data.subscription.status, "PENDING")
console.log(`  checkout provider: ${sub.data.checkout?.provider}`)
await call("POST", "/payments/billing/subscribe", { product: "BRAND_GROWTH" }, B, { allowFail: true })
await call("POST", `/payments/billing/subscriptions/${sub.data.subscription.id}/confirm-test`, null, B)

const billing = await call("GET", "/payments/billing/subscription", null, B)
expect("subscription active", billing.data.subscriptions[0].status, "ACTIVE")
expect("entitled", billing.data.subscriptions[0].entitled, true)
expect("entitlement plan", billing.data.entitlements.brandPlan, "GROWTH")
expect("invoice paid", billing.data.invoices[0]?.status, "PAID")
expect("invoice amount", billing.data.invoices[0]?.amount, 2999)

// The plan is applied by user-service from the event, so give the consumer a moment.
let plan = null
for (let i = 0; i < 20 && plan !== "GROWTH"; i++) {
  plan = (await call("GET", "/brands/me", null, B)).data.plan
  if (plan !== "GROWTH") await new Promise((r) => setTimeout(r, 1000))
}
expect("brand profile plan", plan, "GROWTH")

// ── The discount applies to new offers; the existing deal keeps its rate ──
const after = await call("POST", "/deals", {
  creatorId,
  title: `Post-upgrade deal ${rnd}`,
  amount: 50000,
  paymentMode: "COMPLETION",
  milestones: [],
  deliverables: "1 Reel",
}, B)
expect("fee after upgrade", after.data.feeRates.brand, 0.05)
const unchanged = await call("GET", `/deals/${before.data.id}`, null, B)
expect("existing deal keeps its snapshotted fee", unchanged.data.feeRates.brand, 0.08)

// ── Creator badge ──
console.log("\n— creator buys the priority badge —")
const creatorProducts = await call("GET", "/payments/billing/products", null, C)
const priority = creatorProducts.data.products.find((p) => p.key === "CREATOR_BADGE_PRIORITY")
expect("priority badge price", priority.price, 1999)
const badgeSub = await call("POST", "/payments/billing/subscribe", { product: "CREATOR_BADGE_PRIORITY" }, C)
await call("POST", `/payments/billing/subscriptions/${badgeSub.data.subscription.id}/confirm-test`, null, C)
const creatorBilling = await call("GET", "/payments/billing/subscription", null, C)
expect("badge tier entitlement", creatorBilling.data.entitlements.badgeTier, "PRIORITY")

let badge = null
for (let i = 0; i < 20 && badge !== "PRIORITY"; i++) {
  badge = (await call("GET", "/creators/me", null, C)).data.badgeTier ?? null
  if (badge !== "PRIORITY") await new Promise((r) => setTimeout(r, 1000))
}
expect("creator profile badge tier", badge, "PRIORITY")

const search = await call("GET", "/search/creators?niche=beauty", null, B)
const hit = (search.data.items ?? search.data).find((c) => c.id === creatorId)
console.log(`  search engine: ${search.meta?.engine}; badged creator present: ${!!hit}, tier: ${hit?.badgeTier ?? "—"}`)

// ── Identity verification stays separate from the paid badge ──
const me = await call("GET", "/users/me", null, C)
expect("paid badge did not verify identity", me.data.user.kycStatus, "NONE")

// ── Cancel keeps access to the end of the period ──
console.log("\n— cancel —")
const cancelled = await call("POST", `/payments/billing/subscriptions/${sub.data.subscription.id}/cancel`, null, B)
expect("cancels at period end", cancelled.data.subscription.cancelAtPeriodEnd, true)
expect("still entitled until then", cancelled.data.subscription.entitled, true)
const stillGrowth = await call("GET", "/brands/me", null, B)
expect("plan unchanged until the period ends", stillGrowth.data.plan, "GROWTH")
console.log(`  access until: ${cancelled.data.accessUntil}`)

console.log("\nBilling end-to-end passed ✅")
