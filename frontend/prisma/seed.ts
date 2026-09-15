// Demo marketplace: 3 brands, 14 creators, live briefs, applications and deals
// in every lifecycle state. Run with `npm run db:seed` (wipes existing data).
//
// Logins (password hustl1234): brand@hustl.demo · creator@hustl.demo · admin@hustl.demo

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { briefText, creatorText, localEmbed } from "../lib/ai/embed"
import { scoreCreator } from "../lib/ai/scoring"
import { applicationScore } from "../lib/ai/match"
import { splitMilestones } from "../lib/payments/fees"

const db = new PrismaClient()
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY)
const ahead = (days: number) => new Date(Date.now() + days * DAY)
const ref = (p: string) => `${p}_test_${Math.random().toString(36).slice(2, 12)}`

type Plat = [platform: string, handle: string, followers: number, erPct: number, avgViews: number]
type CreatorSeed = {
  name: string
  email?: string
  handle: string
  headline: string
  bio: string
  location: string
  niches: string[]
  platforms: Plat[]
  growth: number
  deals: number
  rating: number
  onTime: number
  resp: number
  verified: boolean
  available?: boolean
  rate: [string, number][]
  image?: string
  ageDays: number
  languages?: string[]
}

const CREATORS: CreatorSeed[] = [
  { name: "Riya Kapoor", email: "creator@hustl.demo", handle: "riyastyles", headline: "Mumbai fashion & everyday luxury", bio: "I style real-life outfits for working women — office to evening in one look. Known for honest try-ons and fit notes for Indian body types.", location: "Mumbai", niches: ["fashion", "lifestyle"], platforms: [["Instagram", "riyastyles", 184000, 4.2, 95000], ["YouTube", "RiyaStyles", 42000, 5.1, 30000]], growth: 0.04, deals: 11, rating: 4.8, onTime: 0.96, resp: 3, verified: true, rate: [["Instagram Reel", 28000], ["Story set (3)", 9000], ["YouTube integration", 45000]], image: "/professional-woman-dark-hair.png", ageDays: 420, languages: ["English", "Hindi"] },
  { name: "Neha Sharma", handle: "glowwithneha", headline: "Skincare that actually works for Indian skin", bio: "Certified skincare educator. Ingredient breakdowns, SPF testing in Delhi heat and routines under ₹1,000.", location: "Delhi", niches: ["beauty"], platforms: [["Instagram", "glowwithneha", 96000, 5.6, 60000], ["YouTube", "GlowWithNeha", 120000, 4.1, 55000]], growth: 0.06, deals: 18, rating: 4.9, onTime: 0.98, resp: 2, verified: true, rate: [["Instagram Reel", 22000], ["YouTube dedicated video", 60000]], ageDays: 610, languages: ["Hindi", "English"] },
  { name: "Arjun Nair", handle: "arjunlifts", headline: "Science-based fitness for busy Indians", bio: "Strength coach. 20-minute workouts, high-protein vegetarian meals and myth-busting.", location: "Bengaluru", niches: ["fitness"], platforms: [["Instagram", "arjunlifts", 240000, 3.1, 110000], ["YouTube", "ArjunLifts", 310000, 3.8, 140000]], growth: 0.05, deals: 9, rating: 4.6, onTime: 0.9, resp: 6, verified: true, rate: [["Instagram Reel", 35000], ["YouTube integration", 90000]], image: "/professional-bearded-man.png", ageDays: 380, languages: ["English", "Malayalam"] },
  { name: "Kabir Singh", handle: "kabirtechbytes", headline: "Honest gadget reviews in Hinglish", bio: "Phones, laptops and apps reviewed for value — no paid verdicts, ever.", location: "Delhi", niches: ["tech"], platforms: [["YouTube", "KabirTechBytes", 520000, 3.2, 210000], ["Instagram", "kabirtechbytes", 88000, 2.9, 40000]], growth: 0.03, deals: 14, rating: 4.7, onTime: 0.93, resp: 5, verified: true, rate: [["YouTube dedicated video", 120000], ["YouTube Short", 25000]], image: "/professional-asian-man.png", ageDays: 700, languages: ["Hindi", "English"] },
  { name: "Ananya Iyer", handle: "moneywithananya", headline: "Personal finance for your first salary", bio: "Ex-analyst explaining SIPs, taxes and credit cards to Gen Z without the jargon.", location: "Chennai", niches: ["finance", "education"], platforms: [["YouTube", "MoneyWithAnanya", 210000, 4.4, 90000], ["Instagram", "moneywithananya", 150000, 3.9, 70000], ["LinkedIn", "ananya-iyer", 64000, 2.8, 20000]], growth: 0.07, deals: 7, rating: 4.9, onTime: 1, resp: 4, verified: true, rate: [["YouTube integration", 75000], ["Instagram Reel", 30000], ["LinkedIn post", 18000]], ageDays: 300, languages: ["English", "Tamil"] },
  { name: "Zoya Khan", handle: "zoyaeats", headline: "Street food & hidden cafés", bio: "Finding the best ₹100 plates in Hyderabad and beyond.", location: "Hyderabad", niches: ["food", "travel"], platforms: [["Instagram", "zoyaeats", 132000, 6.2, 80000]], growth: 0.05, deals: 10, rating: 4.7, onTime: 0.92, resp: 4, verified: false, rate: [["Instagram Reel", 18000], ["Story set (3)", 6000]], ageDays: 260, languages: ["Hindi", "Urdu", "English"] },
  { name: "Dev Malhotra", handle: "devonthemove", headline: "Slow travel across India", bio: "Homestays, heritage walks and train journeys. Long-form storytelling.", location: "Jaipur", niches: ["travel", "lifestyle"], platforms: [["Instagram", "devonthemove", 78000, 5.4, 45000], ["YouTube", "DevOnTheMove", 36000, 6.0, 25000]], growth: 0.03, deals: 4, rating: 4.5, onTime: 0.88, resp: 10, verified: false, rate: [["Instagram Reel", 15000], ["YouTube vlog", 40000]], ageDays: 200 },
  { name: "Ishaan Verma", handle: "ishaanplays", headline: "BGMI & indie game streams", bio: "Daily streams, esports commentary and PC build guides.", location: "Pune", niches: ["gaming", "tech"], platforms: [["YouTube", "IshaanPlays", 410000, 4.9, 160000], ["Instagram", "ishaanplays", 60000, 3.0, 25000]], growth: 0.08, deals: 6, rating: 4.4, onTime: 0.85, resp: 12, verified: true, rate: [["YouTube integration", 70000], ["Stream shoutout", 20000]], ageDays: 340 },
  { name: "Meera Pillai", handle: "mindfulmeera", headline: "Mindful parenting, zero guilt", bio: "Montessori-at-home ideas and honest mom life for new parents.", location: "Kochi", niches: ["family", "education"], platforms: [["Instagram", "mindfulmeera", 54000, 7.1, 38000]], growth: 0.04, deals: 5, rating: 4.9, onTime: 1, resp: 3, verified: true, rate: [["Instagram Reel", 12000], ["Carousel post", 8000]], ageDays: 230 },
  { name: "Sana Qureshi", handle: "sanastreetstyle", headline: "Thrifted streetwear on a budget", bio: "Styling Sarojini and Colaba finds into runway looks.", location: "Mumbai", niches: ["fashion"], platforms: [["Instagram", "sanastreetstyle", 67000, 5.8, 42000]], growth: 0.09, deals: 2, rating: 4.6, onTime: 0.9, resp: 5, verified: false, rate: [["Instagram Reel", 14000]], ageDays: 150 },
  { name: "Rohan Desai", handle: "rohanrunsfar", headline: "Marathons, trails and recovery", bio: "Amateur ultrarunner documenting training for Comrades.", location: "Ahmedabad", niches: ["fitness", "travel"], platforms: [["Instagram", "rohanrunsfar", 31000, 8.2, 20000]], growth: 0.06, deals: 1, rating: 0, onTime: 1, resp: 8, verified: false, rate: [["Instagram Reel", 8000]], ageDays: 90 },
  { name: "Aditi Rao", handle: "aditidecodes", headline: "Tech careers & AI tools, decoded", bio: "Product manager sharing AI workflows and career advice for engineers.", location: "Hyderabad", niches: ["tech", "education"], platforms: [["LinkedIn", "aditi-rao", 92000, 3.4, 30000], ["YouTube", "AditiDecodes", 45000, 5.0, 22000]], growth: 0.05, deals: 8, rating: 4.8, onTime: 0.97, resp: 3, verified: true, rate: [["LinkedIn post", 20000], ["YouTube integration", 35000]], ageDays: 280 },
  { name: "Vikram Joshi", handle: "vikramviral", headline: "Lifestyle, luxury & motivation", bio: "Luxury lifestyle and daily motivation.", location: "Mumbai", niches: ["lifestyle", "fashion"], platforms: [["Instagram", "vikramviral", 340000, 0.3, 9000]], growth: 0.41, deals: 0, rating: 0, onTime: 0.7, resp: 30, verified: false, rate: [["Instagram Reel", 40000]], ageDays: 40 },
  { name: "Tara Menon", handle: "taracooks", headline: "Kerala home cooking, modern kitchen", bio: "Weeknight recipes with a coastal twist. Cookbook out in 2025.", location: "Bengaluru", niches: ["food", "family"], platforms: [["YouTube", "TaraCooks", 150000, 4.6, 70000], ["Instagram", "taracooks", 90000, 5.0, 50000]], growth: 0.03, deals: 12, rating: 4.8, onTime: 0.95, resp: 6, verified: true, available: false, rate: [["YouTube recipe integration", 50000], ["Instagram Reel", 20000]], ageDays: 520 },
]

async function main() {
  await db.notification.deleteMany()
  await db.review.deleteMany()
  await db.dispute.deleteMany()
  await db.message.deleteMany()
  await db.dealEvent.deleteMany()
  await db.transaction.deleteMany()
  await db.milestone.deleteMany()
  await db.deal.deleteMany()
  await db.application.deleteMany()
  await db.savedCreator.deleteMany()
  await db.brief.deleteMany()
  await db.creatorProfile.deleteMany()
  await db.brandProfile.deleteMany()
  await db.user.deleteMany()

  const passwordHash = await bcrypt.hash("hustl1234", 10)

  const admin = await db.user.create({ data: { email: "admin@hustl.demo", name: "hustl. Trust Team", role: "ADMIN", passwordHash, kycVerified: true } })

  // ─── Brands ───
  const mkBrand = async (o: { email: string; name: string; company: string; slug: string; industry: string; location: string; size: string; plan: string; verified: boolean; description: string; website: string; ageDays: number }) => {
    const user = await db.user.create({ data: { email: o.email, name: o.name, role: "BRAND", passwordHash, kycVerified: true, createdAt: ago(o.ageDays) } })
    const brand = await db.brandProfile.create({
      data: { userId: user.id, slug: o.slug, companyName: o.company, industry: o.industry, location: o.location, size: o.size, plan: o.plan, verified: o.verified, description: o.description, website: o.website },
    })
    return { user, brand }
  }
  const kora = await mkBrand({ email: "brand@hustl.demo", name: "Aarav Mehta", company: "Kōra Skincare", slug: "kora-skincare", industry: "Beauty & personal care", location: "Mumbai", size: "11–50", plan: "GROWTH", verified: true, description: "Clean, SPF-first skincare made for Indian summers. Dermatologist-tested, fragrance-free, under ₹999.", website: "https://kora.example", ageDays: 300 })
  const monk = await mkBrand({ email: "urban@hustl.demo", name: "Priya Nanda", company: "Urban Monk Apparel", slug: "urban-monk", industry: "Fashion", location: "Bengaluru", size: "51–200", plan: "STARTER", verified: true, description: "Relaxed streetwear built for Indian weather — breathable fabrics, oversized fits, small-batch drops.", website: "https://urbanmonk.example", ageDays: 240 })
  const stackd = await mkBrand({ email: "stackd@hustl.demo", name: "Karan Batra", company: "Stackd", slug: "stackd", industry: "Fintech", location: "Gurugram", size: "51–200", plan: "GROWTH", verified: false, description: "Stackd helps first-time investors start SIPs from ₹100 and track every rupee.", website: "https://stackd.example", ageDays: 180 })

  // ─── Creators ───
  const creators: Record<string, Awaited<ReturnType<typeof db.creatorProfile.create>> & { userName: string }> = {}
  for (const c of CREATORS) {
    const user = await db.user.create({
      data: { email: c.email ?? `${c.handle}@hustl.demo`, name: c.name, role: "CREATOR", passwordHash, kycVerified: c.verified, image: c.image, createdAt: ago(c.ageDays) },
    })
    const followers = c.platforms.reduce((s, p) => s + p[2], 0)
    const engagementRate = c.platforms.reduce((s, p) => s + p[2] * (p[3] / 100), 0) / followers
    const base = {
      headline: c.headline,
      bio: c.bio,
      location: c.location,
      niches: c.niches,
      platforms: c.platforms.map(([platform, handle, f, er, avgViews]) => ({ platform, handle, followers: f, engagementRate: er / 100, avgViews })),
    }
    const scores = scoreCreator({
      followers,
      engagementRate,
      followerGrowth30d: c.growth,
      completedDeals: c.deals,
      avgRating: c.rating,
      onTimeRate: c.onTime,
      responseHours: c.resp,
      createdAt: ago(c.ageDays),
      verified: c.verified,
      niches: c.niches,
    })
    const profile = await db.creatorProfile.create({
      data: {
        userId: user.id,
        handle: c.handle,
        ...base,
        avatarUrl: c.image,
        languages: c.languages ?? ["English", "Hindi"],
        rateCard: c.rate.map(([deliverable, price]) => ({ deliverable, price })),
        portfolio: [
          { title: `${c.niches[0][0].toUpperCase()}${c.niches[0].slice(1)} campaign highlight`, url: `https://instagram.com/${c.handle}`, brand: "Previous collab" },
        ],
        followers,
        engagementRate,
        followerGrowth30d: c.growth,
        completedDeals: c.deals,
        avgRating: c.rating,
        onTimeRate: c.onTime,
        responseHours: c.resp,
        verified: c.verified,
        available: c.available ?? true,
        socialsConnected: true,
        lastSyncedAt: ago(0.3),
        ...scores,
        embedding: localEmbed(creatorText(base)),
        createdAt: ago(c.ageDays),
      },
    })
    creators[c.handle] = { ...profile, userName: c.name }
  }

  // ─── Briefs ───
  const mkBrief = async (brandId: string, o: { title: string; description: string; niche: string; platforms: string[]; deliverables: { type: string; quantity: number }[]; minFollowers: number; minEngagement?: number; budget: number; creators: number; location: string; timeline: string; audience: string; status: string; daysAgo: number; deadline?: number }) => {
    const data = { title: o.title, description: o.description, niche: o.niche, platforms: o.platforms, audience: o.audience, location: o.location }
    return db.brief.create({
      data: {
        brandId,
        ...data,
        deliverables: o.deliverables,
        minFollowers: o.minFollowers,
        minEngagement: o.minEngagement ?? 0,
        budgetPerCreator: o.budget,
        creatorsNeeded: o.creators,
        timeline: o.timeline,
        status: o.status,
        deadline: o.deadline ? ahead(o.deadline) : null,
        embedding: localEmbed(briefText(data)),
        createdAt: ago(o.daysAgo),
      },
    })
  }
  const spf = await mkBrief(kora.brand.id, { title: "Summer SPF 50 launch — Reels in Mumbai & Delhi", description: "We're launching our SPF 50 gel sunscreen and need beauty and skincare creators on Instagram with 50K+ followers in Mumbai and Delhi. 1 Reel + 3 stories each showing daily reapplication in real heat. No white cast, no fragrance — show the texture.", niche: "beauty", platforms: ["instagram"], deliverables: [{ type: "Reel", quantity: 1 }, { type: "Story", quantity: 3 }], minFollowers: 50000, minEngagement: 0.03, budget: 25000, creators: 4, location: "Mumbai, Delhi", timeline: "First two weeks of April", audience: "Women 18–34 in metro cities", status: "PUBLISHED", daysAgo: 6, deadline: 20 })
  await mkBrief(kora.brand.id, { title: "Festive gift box unboxing", description: "Unboxing and first-impressions of our Diwali skincare gift box on YouTube and Instagram.", niche: "beauty", platforms: ["youtube", "instagram"], deliverables: [{ type: "YouTube video", quantity: 1 }], minFollowers: 80000, budget: 40000, creators: 2, location: "Pan-India", timeline: "October", audience: "Gift buyers 22–40", status: "DRAFT", daysAgo: 1 })
  const serum = await mkBrief(kora.brand.id, { title: "Hydration serum launch — YouTube reviews", description: "Long-form honest reviews of our hyaluronic serum.", niche: "beauty", platforms: ["youtube"], deliverables: [{ type: "YouTube video", quantity: 1 }], minFollowers: 100000, budget: 55000, creators: 2, location: "Pan-India", timeline: "Q2", audience: "Skincare enthusiasts", status: "CLOSED", daysAgo: 125 })
  const monsoon = await mkBrief(monk.brand.id, { title: "Monsoon streetwear drop", description: "Style our quick-dry monsoon collection for rainy commutes. Fashion creators in Mumbai and Bengaluru, 2 Reels showing 3 looks each.", niche: "fashion", platforms: ["instagram"], deliverables: [{ type: "Reel", quantity: 2 }], minFollowers: 30000, budget: 18000, creators: 5, location: "Mumbai, Bengaluru", timeline: "Mid June", audience: "Gen Z & millennials", status: "PUBLISHED", daysAgo: 3, deadline: 12 })
  const sip = await mkBrief(stackd.brand.id, { title: "Explain SIPs to Gen Z on YouTube", description: "A 60–90s integration inside a finance video explaining how SIPs work and showing how to start one on Stackd from ₹100. Finance or education creators with 100K+ subscribers.", niche: "finance", platforms: ["youtube"], deliverables: [{ type: "YouTube integration", quantity: 1 }], minFollowers: 100000, minEngagement: 0.03, budget: 80000, creators: 3, location: "Pan-India", timeline: "Next month", audience: "First-jobbers 21–28", status: "PUBLISHED", daysAgo: 9, deadline: 25 })
  await mkBrief(stackd.brand.id, { title: "LinkedIn creators for Stackd for Teams", description: "Launch posts about offering SIP benefits to employees. Tech and career creators on LinkedIn with 20K+ followers.", niche: "finance", platforms: ["linkedin"], deliverables: [{ type: "LinkedIn post", quantity: 2 }], minFollowers: 20000, budget: 20000, creators: 6, location: "Bengaluru, Gurugram", timeline: "In 3 weeks", audience: "HR leaders & founders", status: "PUBLISHED", daysAgo: 2, deadline: 18 })

  // ─── Applications (scored by AI module 5) ───
  const apply = async (brief: typeof spf, handle: string, pitch: string, rate: number, status: string, daysAgo: number) => {
    const c = creators[handle]
    const s = applicationScore(c, brief)
    return db.application.create({
      data: { briefId: brief.id, creatorId: c.id, pitch, proposedRate: rate, status, matchScore: s.score, matchReasons: s.reasons, disqualifiers: s.disqualifiers, createdAt: ago(daysAgo) },
    })
  }
  const nehaApp = await apply(spf, "glowwithneha", "I test sunscreens outdoors in Delhi's 44°C heat every summer — my SPF reapplication Reel last year hit 1.2M views. I'd show your gel texture on bare skin and over makeup.", 25000, "OFFERED", 5)
  await apply(spf, "zoyaeats", "Food walks in the sun all day — a natural fit for a reapplication story!", 20000, "APPLIED", 4)
  await apply(spf, "sanastreetstyle", "My audience is 78% women 18–30 in Mumbai. Happy to style SPF into a get-ready-with-me.", 18000, "APPLIED", 3)
  await apply(spf, "mindfulmeera", "Moms ask me daily about safe sunscreen for school runs.", 15000, "APPLIED", 2)
  await apply(spf, "vikramviral", "Big reach guaranteed.", 40000, "APPLIED", 1)
  const riyaApp = await apply(monsoon, "riyastyles", "Rainy Mumbai commutes are my whole content calendar in June — 3 looks, office-ready, with a waterlogged-street test.", 18000, "OFFERED", 2)
  await apply(monsoon, "sanastreetstyle", "Thrift-meets-streetwear monsoon edit for Colaba Causeway.", 15000, "SHORTLISTED", 2)
  const ananyaApp = await apply(sip, "moneywithananya", "My SIP explainer is my most-watched video (1.1M). I'd walk through starting a ₹500 SIP on Stackd live.", 80000, "OFFERED", 8)
  await apply(sip, "aditidecodes", "Can pair SIPs with a 'first salary tech stack' angle.", 35000, "APPLIED", 5)

  await db.savedCreator.createMany({ data: ["glowwithneha", "zoyaeats", "sanastreetstyle"].map((h) => ({ brandId: kora.brand.id, creatorId: creators[h].id })) })

  // ─── Deals across every lifecycle state ───
  type MSpec = { title: string; percent: number; status: string; submitted?: number; released?: number; url?: string; note?: string; due?: number }
  const ORDER = ["OFFER_SENT", "CONTRACT_PENDING", "CONTRACT_SIGNED", "FUNDED", "IN_PROGRESS", "COMPLETED"]
  const mkDeal = async (o: {
    brand: typeof kora
    creator: string
    title: string
    amount: number
    mode: "COMPLETION" | "UPFRONT" | "MILESTONES"
    status: string
    created: number
    milestones: MSpec[]
    deliverables: string
    awaiting?: "BRAND" | "CREATOR"
    round?: number
    briefId?: string
    applicationId?: string
    creatorSigned?: boolean
    messages?: [who: "brand" | "creator", body: string, daysAgo: number][]
  }) => {
    const c = creators[o.creator]
    const reached = o.status === "DISPUTED" ? 4 : o.status === "CANCELLED" ? 0 : ORDER.indexOf(o.status)
    const at = (d: number) => ago(Math.max(d, 0.02))
    const accepted = o.created - 1
    const signed = o.created - 1.5
    const funded = o.created - 2
    const releasedDays = o.milestones.filter((m) => m.released !== undefined).map((m) => m.released!)
    const split = splitMilestones(o.amount, o.milestones)
    const brandFeePct = o.brand.brand.plan === "GROWTH" ? 0.05 : 0.08
    const deal = await db.deal.create({
      data: {
        title: o.title,
        brandId: o.brand.brand.id,
        creatorId: c.id,
        briefId: o.briefId,
        applicationId: o.applicationId,
        amount: o.amount,
        paymentMode: o.mode,
        status: o.status,
        awaitingParty: o.awaiting ?? "CREATOR",
        negotiationRound: o.round ?? 0,
        deliverables: o.deliverables,
        dueDate: ahead(14),
        brandFeePct,
        brandSignedAt: reached >= 2 ? at(signed) : null,
        creatorSignedAt: reached >= 2 || o.creatorSigned ? at(signed + 0.2) : null,
        fundedAt: reached >= 3 ? at(funded) : null,
        completedAt: o.status === "COMPLETED" ? at(Math.min(...releasedDays)) : null,
        createdAt: ago(o.created),
        milestones: {
          create: split.map((m, i) => ({
            order: i,
            title: m.title,
            percent: m.percent,
            amount: m.amount,
            status: o.milestones[i].status,
            dueDate: o.milestones[i].due !== undefined ? ahead(o.milestones[i].due!) : null,
            submissionUrl: o.milestones[i].submitted !== undefined ? (o.milestones[i].url ?? `https://instagram.com/reel/${c.handle}-${i + 1}`) : null,
            submissionNote: o.milestones[i].note ?? null,
            submittedAt: o.milestones[i].submitted !== undefined ? at(o.milestones[i].submitted!) : null,
            approvedAt: o.milestones[i].released !== undefined ? at(o.milestones[i].released!) : null,
            releasedAt: o.milestones[i].released !== undefined ? at(o.milestones[i].released!) : null,
          })),
        },
      },
      include: { milestones: true },
    })

    const ev: { type: string; from?: string; to?: string; note?: string; d: number; actor: string }[] = [{ type: "OFFER", to: "OFFER_SENT", d: o.created, actor: o.brand.user.id }]
    if (o.round) ev.push({ type: "COUNTER", from: "OFFER_SENT", to: "OFFER_SENT", note: "Countered with a revised amount", d: o.created - 0.5, actor: c.userId })
    if (reached >= 1) ev.push({ type: "ACCEPT", from: "OFFER_SENT", to: "CONTRACT_PENDING", d: accepted, actor: c.userId })
    if (reached >= 2) ev.push({ type: "SIGN", from: "CONTRACT_PENDING", to: "CONTRACT_SIGNED", note: "Contract fully executed", d: signed, actor: o.brand.user.id })
    if (reached >= 3) {
      ev.push({ type: "FUND", from: "CONTRACT_SIGNED", to: "FUNDED", d: funded, actor: o.brand.user.id })
      ev.push({ type: "START", from: "FUNDED", to: "IN_PROGRESS", note: "Escrow secured — work can begin", d: funded, actor: o.brand.user.id })
      await db.transaction.createMany({
        data: [
          { dealId: deal.id, type: "ESCROW_FUND", amount: o.amount, reference: ref("esc"), createdAt: at(funded) },
          { dealId: deal.id, type: "BRAND_FEE", amount: Math.round(o.amount * brandFeePct), reference: ref("fee"), createdAt: at(funded) },
          { dealId: deal.id, type: "PROCESSING_FEE", amount: Math.round(o.amount * 0.02), reference: ref("pg"), createdAt: at(funded) },
        ],
      })
    }
    for (const m of deal.milestones) {
      const spec = o.milestones[m.order]
      if (spec.submitted !== undefined) ev.push({ type: "MILESTONE_SUBMITTED", note: m.title, d: spec.submitted, actor: c.userId })
      if (spec.released !== undefined) {
        const fee = Math.round(m.amount * 0.05)
        ev.push({ type: "PAYMENT_RELEASED", note: `${m.title} · ₹${(m.amount - fee).toLocaleString("en-IN")} paid out`, d: spec.released, actor: o.brand.user.id })
        await db.transaction.createMany({
          data: [
            { dealId: deal.id, milestoneId: m.id, type: "RELEASE", amount: m.amount - fee, reference: ref("po"), createdAt: at(spec.released) },
            { dealId: deal.id, milestoneId: m.id, type: "CREATOR_FEE", amount: fee, reference: ref("fee"), createdAt: at(spec.released) },
          ],
        })
      }
    }
    if (o.status === "COMPLETED") ev.push({ type: "COMPLETE", from: "IN_PROGRESS", to: "COMPLETED", note: "All milestones settled", d: Math.min(...releasedDays), actor: o.brand.user.id })
    if (o.status === "CANCELLED") ev.push({ type: "DECLINE", from: "OFFER_SENT", to: "CANCELLED", d: o.created - 1, actor: c.userId })
    await db.dealEvent.createMany({ data: ev.map((e) => ({ dealId: deal.id, actorId: e.actor, type: e.type, fromStatus: e.from, toStatus: e.to, note: e.note, createdAt: at(e.d) })) })
    for (const [who, body, d] of o.messages ?? [])
      await db.message.create({ data: { dealId: deal.id, senderId: who === "brand" ? o.brand.user.id : c.userId, body, createdAt: at(d) } })
    return deal
  }

  const d1 = await mkDeal({
    brand: kora, creator: "riyastyles", title: "SPF 50 office-to-evening Reel series", amount: 60000, mode: "MILESTONES", status: "IN_PROGRESS", created: 15,
    deliverables: "2 Instagram Reels + 6 stories featuring SPF 50 gel in a workday routine; 1 round of revisions; tag @koraskincare and use #KoraSummer.",
    milestones: [
      { title: "Concept & script approval", percent: 30, status: "RELEASED", submitted: 9, released: 8, url: "https://docs.google.com/document/d/riya-spf-script" },
      { title: "2 Reels + 6 stories live", percent: 70, status: "SUBMITTED", submitted: 0.4, url: "https://instagram.com/reel/riyastyles-spf", note: "Both Reels are live — posted 7pm IST for peak reach. Stories go up tomorrow morning.", due: 3 },
    ],
    messages: [
      ["brand", "Hi Riya! Loved your office-looks series — we'd love the SPF to feel like part of getting ready, not an ad.", 15],
      ["creator", "Totally agree. I'll open with the 'why my makeup melts at 2pm' hook and reapply over foundation at lunch.", 14.5],
      ["brand", "Script approved 🙌 released the first milestone.", 8],
      ["creator", "Both Reels are live! Stories tomorrow. Early numbers look great — 48K views in 3 hours.", 0.4],
    ],
  })
  await mkDeal({
    brand: monk, creator: "riyastyles", title: "Monsoon drop — 3 rainy-day looks", amount: 36000, mode: "COMPLETION", status: "OFFER_SENT", created: 1, briefId: monsoon.id, applicationId: riyaApp.id,
    deliverables: "2 Instagram Reels, 3 looks each from the monsoon collection, shot on location in Mumbai.", milestones: [{ title: "Final delivery", percent: 100, status: "PENDING", due: 14 }],
    messages: [["brand", "Your waterlogged-street test idea is exactly the energy we want. Offering ₹36K for 2 Reels — open to your thoughts!", 1]],
  })
  await mkDeal({
    brand: kora, creator: "glowwithneha", title: "SPF 50 — hero Reel", amount: 25000, mode: "COMPLETION", status: "CONTRACT_PENDING", created: 3, briefId: spf.id, applicationId: nehaApp.id, creatorSigned: true,
    deliverables: "1 Instagram Reel + 3 stories showing reapplication outdoors in Delhi heat.", milestones: [{ title: "Final delivery", percent: 100, status: "PENDING", due: 18 }],
  })
  await mkDeal({
    brand: kora, creator: "arjunlifts", title: "Sweat-proof SPF gym test", amount: 45000, mode: "MILESTONES", status: "CONTRACT_SIGNED", created: 4,
    deliverables: "1 YouTube Short + 1 Reel: SPF tested through a 45-minute outdoor workout.",
    milestones: [{ title: "Shoot plan", percent: 20, status: "PENDING", due: 6 }, { title: "Content live", percent: 80, status: "PENDING", due: 16 }],
  })
  await mkDeal({
    brand: kora, creator: "glowwithneha", title: "Hydration serum — honest review", amount: 55000, mode: "MILESTONES", status: "COMPLETED", created: 118, briefId: serum.id,
    deliverables: "1 dedicated YouTube review + 1 Reel cut-down.",
    milestones: [{ title: "Draft video", percent: 50, status: "RELEASED", submitted: 105, released: 104 }, { title: "Video + Reel live", percent: 50, status: "RELEASED", submitted: 98, released: 97 }],
  })
  await mkDeal({
    brand: kora, creator: "taracooks", title: "Glow from within — recipe collab", amount: 30000, mode: "COMPLETION", status: "COMPLETED", created: 75,
    deliverables: "1 YouTube recipe integration.", milestones: [{ title: "Final delivery", percent: 100, status: "RELEASED", submitted: 66, released: 65 }],
  })
  await mkDeal({
    brand: stackd, creator: "moneywithananya", title: "SIP explainer integration", amount: 80000, mode: "MILESTONES", status: "OFFER_SENT", created: 2, awaiting: "BRAND", round: 1, briefId: sip.id, applicationId: ananyaApp.id,
    deliverables: "90-second integration in a YouTube video + pinned comment + 1 Instagram Reel cut-down.",
    milestones: [{ title: "Script approval", percent: 25, status: "PENDING" }, { title: "Video live", percent: 75, status: "PENDING" }],
    messages: [["creator", "Countered at ₹80K — that includes the Instagram cut-down and 30-day link in bio, which usually runs ₹30K on its own.", 1.5]],
  })
  const d8 = await mkDeal({
    brand: stackd, creator: "kabirtechbytes", title: "Budget phones for your first salary", amount: 120000, mode: "MILESTONES", status: "DISPUTED", created: 20,
    deliverables: "Dedicated YouTube video with a 2-minute Stackd app walkthrough (sign-up → first SIP).",
    milestones: [{ title: "Script approval", percent: 30, status: "RELEASED", submitted: 15, released: 14 }, { title: "Video live", percent: 70, status: "DISPUTED", submitted: 1, url: "https://youtube.com/watch?v=kabir-first-salary" }],
    messages: [
      ["creator", "Video is live! Stackd segment is at 6:40.", 1],
      ["brand", "The segment is 25 seconds and skips the SIP setup flow we agreed on in the script.", 0.8],
      ["creator", "The walkthrough felt like an ad — retention dropped in testing. The mention is still there.", 0.7],
    ],
  })
  await db.dispute.create({ data: { dealId: d8.id, milestoneId: d8.milestones.find((m) => m.order === 1)!.id, raisedById: stackd.user.id, reason: "The published video only includes a 25-second mention and skips the app walkthrough (sign-up → first SIP) that was approved in the script milestone.", createdAt: ago(0.6) } })
  await mkDeal({
    brand: stackd, creator: "riyastyles", title: "First-salary wardrobe on a budget", amount: 42000, mode: "COMPLETION", status: "COMPLETED", created: 58,
    deliverables: "1 Reel + 3 stories.", milestones: [{ title: "Final delivery", percent: 100, status: "RELEASED", submitted: 48, released: 47 }],
  })
  await mkDeal({
    brand: monk, creator: "riyastyles", title: "Winter capsule lookbook", amount: 30000, mode: "MILESTONES", status: "COMPLETED", created: 150,
    deliverables: "Carousel lookbook + 1 Reel.", milestones: [{ title: "Moodboard", percent: 40, status: "RELEASED", submitted: 142, released: 141 }, { title: "Content live", percent: 60, status: "RELEASED", submitted: 132, released: 130 }],
  })
  await mkDeal({
    brand: kora, creator: "zoyaeats", title: "Café SPF pop-up", amount: 20000, mode: "COMPLETION", status: "CANCELLED", created: 32,
    deliverables: "1 Reel at our café pop-up.", milestones: [{ title: "Final delivery", percent: 100, status: "PENDING" }],
  })

  // ─── Reviews ───
  const completed = await db.deal.findMany({ where: { status: "COMPLETED" }, include: { brand: true, creator: true } })
  const quotes = [
    "Delivered ahead of schedule and the content outperformed our paid ads.",
    "Clear brief, fast approvals and payment landed the same day. Would work again.",
    "Thoughtful creative that felt native to their audience.",
  ]
  for (const [i, d] of completed.entries()) {
    await db.review.create({ data: { dealId: d.id, authorId: d.brand.userId, subjectUserId: d.creator.userId, rating: i === 3 ? 4 : 5, comment: quotes[i % 3] } })
    await db.review.create({ data: { dealId: d.id, authorId: d.creator.userId, subjectUserId: d.brand.userId, rating: 5, comment: quotes[(i + 1) % 3] } })
  }

  // ─── Notifications ───
  const riya = creators.riyastyles
  await db.notification.createMany({
    data: [
      { userId: kora.user.id, title: "Deliverable ready for review", body: "Riya Kapoor submitted “2 Reels + 6 stories live”", href: `/brand/deals/${d1.id}`, createdAt: ago(0.4) },
      { userId: kora.user.id, title: "Your signature is needed", body: "SPF 50 — hero Reel", href: "/brand/deals", createdAt: ago(1) },
      { userId: kora.user.id, title: "4 new applications", body: "Summer SPF 50 launch — Reels in Mumbai & Delhi", href: `/brand/briefs/${spf.id}`, createdAt: ago(2) },
      { userId: riya.userId, title: "New offer from Urban Monk Apparel", body: "Monsoon drop — 3 rainy-day looks · ₹36,000", href: "/creator/deals", createdAt: ago(1) },
      { userId: riya.userId, title: "Payment released 🎉", body: "₹17,100 for “Concept & script approval”", href: "/creator/earnings", createdAt: ago(8), read: true },
      { userId: stackd.user.id, title: "Counter-offer received", body: "SIP explainer integration · ₹80,000", href: "/brand/deals", createdAt: ago(1.5) },
      { userId: admin.id, title: "New dispute to review", body: "Budget phones for your first salary", href: "/admin", createdAt: ago(0.6) },
    ],
  })

  console.log("Seeded hustl. demo data. Log in with brand@hustl.demo / creator@hustl.demo / admin@hustl.demo — password hustl1234")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
