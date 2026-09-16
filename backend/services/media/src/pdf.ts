// PDF rendering with pdfkit. Every value printed comes from stored records;
// missing data is shown as unavailable, never estimated.

import PDFDocument from "pdfkit"
import { prisma } from "@hustl/db"
import { errors } from "@hustl/common"

type Doc = PDFKit.PDFDocument

const INK = "#111111"
const MUTED = "#666666"
const RULE = "#DDDDDD"

const inr = (n: number) => `INR ${n.toLocaleString("en-IN")}`
const date = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "-")
const dateTime = (d: Date | null | undefined) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "-")
const pct = (f: number | null | undefined) => (f == null ? "-" : `${(f * 100).toFixed(2)}%`)
const num = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("en-IN"))
const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())

export function renderPdf(title: string, build: (doc: Doc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: title, Creator: "hustl." } })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    try {
      build(doc)
      footer(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function footer(doc: Doc) {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const bottom = doc.page.height - 35
    doc.fontSize(8).fillColor(MUTED).text(`hustl. · generated ${dateTime(new Date())} · page ${i + 1} of ${range.count}`, 50, bottom, {
      width: doc.page.width - 100,
      align: "center",
      lineBreak: false,
    })
  }
}

const ensureSpace = (doc: Doc, height: number) => {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom - 20) doc.addPage()
}

function header(doc: Doc, title: string, subtitle?: string) {
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(title)
  if (subtitle) doc.moveDown(0.2).font("Helvetica").fontSize(11).fillColor(MUTED).text(subtitle)
  doc.moveDown(0.6)
  rule(doc)
}

function rule(doc: Doc) {
  const y = doc.y
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(RULE).lineWidth(1).stroke()
  doc.moveDown(0.6)
}

function section(doc: Doc, title: string) {
  ensureSpace(doc, 60)
  doc.moveDown(0.6).font("Helvetica-Bold").fontSize(13).fillColor(INK).text(title, 50)
  doc.moveDown(0.3)
}

function kv(doc: Doc, pairs: [string, string][]) {
  for (const [k, v] of pairs) {
    ensureSpace(doc, 16)
    const y = doc.y
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(k, 50, y, { width: 150 })
    const h1 = doc.y - y
    doc.fillColor(INK).text(v || "-", 200, y, { width: doc.page.width - 250 })
    doc.y = Math.max(y + h1, doc.y)
    doc.x = 50
  }
}

function table(doc: Doc, headers: string[], widths: number[], rows: string[][]) {
  const line = (cells: string[], bold: boolean) => {
    const heights = cells.map((c, i) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(c || "-", { width: widths[i] - 6 }))
    const h = Math.max(...heights, 12)
    ensureSpace(doc, h + 6)
    const y = doc.y
    let x = 50
    cells.forEach((c, i) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(bold ? MUTED : INK).text(c || "-", x, y, { width: widths[i] - 6 })
      x += widths[i]
    })
    doc.y = y + h + 4
    doc.x = 50
  }
  line(headers, true)
  if (!rows.length) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text("None recorded.", 50)
    return
  }
  for (const r of rows) line(r, false)
}

function paragraph(doc: Doc, text: string, opts: { indent?: number; color?: string; size?: number } = {}) {
  ensureSpace(doc, 20)
  doc.font("Helvetica").fontSize(opts.size ?? 10).fillColor(opts.color ?? INK).text(text, 50 + (opts.indent ?? 0), doc.y, { width: doc.page.width - 100 - (opts.indent ?? 0) })
}

/** Renders structured contract terms: `clauses: [{title, body}]` or any JSON object. */
function renderTerms(doc: Doc, value: unknown, depth = 0): void {
  if (value == null) return
  if (typeof value !== "object") {
    paragraph(doc, String(value), { indent: depth * 12 })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>
        const heading = o.title ?? o.heading ?? o.name
        const body = o.body ?? o.text ?? o.content
        if (heading !== undefined || body !== undefined) {
          ensureSpace(doc, 30)
          doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(`${i + 1}. ${String(heading ?? "")}`, 50 + depth * 12)
          if (body !== undefined) renderTerms(doc, body, depth + 1)
          const rest = Object.fromEntries(Object.entries(o).filter(([k]) => !["title", "heading", "name", "body", "text", "content", "id"].includes(k)))
          if (Object.keys(rest).length) renderTerms(doc, rest, depth + 1)
          doc.moveDown(0.3)
          return
        }
      }
      if (item && typeof item === "object") renderTerms(doc, item, depth + 1)
      else paragraph(doc, `• ${String(item)}`, { indent: depth * 12 })
    })
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      ensureSpace(doc, 30)
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(humanize(k), 50 + depth * 12)
      renderTerms(doc, v, depth + 1)
    } else {
      paragraph(doc, `${humanize(k)}: ${v == null ? "-" : String(v)}`, { indent: depth * 12 })
    }
  }
}

// ─── Signed contract ─────────────────────────────────────────────────────────

export async function loadContractForPdf(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contract: true,
      brand: { select: { companyName: true, userId: true } },
      creator: { select: { handle: true, user: { select: { name: true } } } },
    },
  })
  if (!deal) throw errors.notFound("Deal")
  if (!deal.contract) throw errors.notFound("Contract")
  const c = deal.contract
  if (!c.brandSignedAt || !c.creatorSignedAt) throw errors.conflict("Contract must be signed by both parties before the PDF can be generated")
  return { deal, contract: c }
}

export function renderContractPdf({ deal, contract }: Awaited<ReturnType<typeof loadContractForPdf>>) {
  return renderPdf(`Contract — ${deal.title}`, (doc) => {
    header(doc, "Creator Collaboration Agreement", deal.title)
    kv(doc, [
      ["Brand", deal.brand.companyName],
      ["Creator", `${deal.creator.user.name} (@${deal.creator.handle})`],
      ["Amount", inr(deal.amount)],
      ["Payment mode", humanize(deal.paymentMode.toLowerCase())],
      ["Due date", date(deal.dueDate)],
      ["Contract version", String(contract.version)],
      ["Deal reference", deal.id],
    ])
    section(doc, "Terms")
    renderTerms(doc, contract.terms)
    section(doc, "Signatures")
    kv(doc, [
      ["Signed for the brand", `${contract.brandSignerName ?? "-"} on ${dateTime(contract.brandSignedAt)}`],
      ["Signed by the creator", `${contract.creatorSignerName ?? "-"} on ${dateTime(contract.creatorSignedAt)}`],
      ["Terms hash (SHA-256)", contract.bodyHash],
    ])
    doc.moveDown(0.5)
    paragraph(doc, "Both parties signed the terms identified by the hash above electronically on hustl.", { color: MUTED, size: 9 })
  })
}

// ─── Media kit ───────────────────────────────────────────────────────────────

export async function renderMediaKit(creatorId: string) {
  const creator = await prisma.creatorProfile.findUnique({
    where: { id: creatorId },
    include: {
      user: { select: { name: true, status: true, deletedAt: true } },
      socialAccounts: { where: { status: { not: "DISCONNECTED" } }, orderBy: { platform: "asc" } },
      score: true,
    },
  })
  if (!creator || creator.deletedAt || creator.user.deletedAt || creator.user.status !== "ACTIVE") throw errors.notFound("Creator")
  const reviews = await prisma.review.findMany({ where: { subjectUserId: creator.userId }, orderBy: { createdAt: "desc" }, take: 5 })
  const rateCard = Array.isArray(creator.rateCard) ? (creator.rateCard as { deliverable?: unknown; price?: unknown }[]) : []

  return renderPdf(`Media kit — @${creator.handle}`, (doc) => {
    header(doc, creator.user.name, `@${creator.handle}${creator.headline ? ` · ${creator.headline}` : ""}`)
    kv(doc, [
      ["Location", creator.location],
      ["Niches", creator.niches.join(", ")],
      ["Languages", creator.languages.join(", ")],
      ["Profile verified", creator.verifiedAt ? `Yes (${date(creator.verifiedAt)})` : "No"],
    ])
    if (creator.bio) {
      section(doc, "About")
      paragraph(doc, creator.bio)
    }

    section(doc, "Audience")
    kv(doc, [
      ["Total followers", num(creator.followersTotal)],
      ["Engagement rate (follower-weighted)", pct(creator.engagementRate)],
      ["Follower growth (30 days)", pct(creator.followerGrowth30d)],
    ])
    doc.moveDown(0.4)
    table(
      doc,
      ["Platform", "Handle", "Followers", "Engagement", "Avg views", "Data source"],
      [70, 100, 70, 70, 70, 115],
      creator.socialAccounts.map((a) => [
        humanize(a.platform.toLowerCase()),
        `@${a.handle}`,
        num(a.followers),
        pct(a.engagementRate),
        num(a.avgViews),
        a.source === "PHYLLO" && a.status === "CONNECTED" ? `Verified via Phyllo (synced ${date(a.lastSyncedAt)})` : a.source === "PHYLLO" ? `Phyllo (${a.status.toLowerCase()})` : "Self-reported, unverified",
      ]),
    )
    if (creator.socialAccounts.some((a) => a.source === "SELF_REPORTED"))
      paragraph(doc, "Self-reported figures were entered by the creator and have not been verified by hustl.", { color: MUTED, size: 8 })

    section(doc, "hustl. scores")
    if (creator.score)
      kv(doc, [
        ["Trust score", `${creator.score.trustScore} / 100`],
        ["Reliability", `${creator.score.reliabilityScore} / 100`],
        ["Niche authority", `${creator.score.nicheAuthority} / 100`],
        ["Authenticity", creator.score.authenticityScore == null ? "-" : `${creator.score.authenticityScore} / 100`],
        ["Computed", `${date(creator.score.computedAt)} (model ${creator.score.modelVersion})`],
      ])
    else paragraph(doc, "Scores have not been computed yet.", { color: MUTED })

    section(doc, "Track record on hustl.")
    kv(doc, [
      ["Completed deals", String(creator.completedDeals)],
      ["Average rating", creator.avgRating == null ? "-" : `${creator.avgRating.toFixed(2)} / 5`],
      ["On-time delivery", pct(creator.onTimeRate)],
    ])
    if (reviews.length) {
      doc.moveDown(0.4)
      table(doc, ["Date", "Rating", "Comment"], [80, 60, 355], reviews.map((r) => [date(r.createdAt), `${r.rating} / 5`, r.comment]))
    }

    if (rateCard.length) {
      section(doc, "Rate card")
      table(
        doc,
        ["Deliverable", "Price"],
        [345, 150],
        rateCard.map((r) => [String(r.deliverable ?? "-"), typeof r.price === "number" ? inr(r.price) : "-"]),
      )
    }
  })
}

// ─── Deal report ─────────────────────────────────────────────────────────────

export async function renderDealReport(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      brand: { select: { companyName: true } },
      creator: { select: { handle: true, user: { select: { name: true } } } },
      milestones: { orderBy: { position: "asc" } },
      ledger: { orderBy: { createdAt: "asc" } },
      escrow: true,
    },
  })
  if (!deal) throw errors.notFound("Deal")
  const totals = new Map<string, number>()
  for (const l of deal.ledger) totals.set(l.type, (totals.get(l.type) ?? 0) + l.amount)

  return renderPdf(`Deal report — ${deal.title}`, (doc) => {
    header(doc, "Deal report", deal.title)
    kv(doc, [
      ["Brand", deal.brand.companyName],
      ["Creator", `${deal.creator.user.name} (@${deal.creator.handle})`],
      ["Status", humanize(deal.status.toLowerCase())],
      ["Amount", inr(deal.amount)],
      ["Payment mode", humanize(deal.paymentMode.toLowerCase())],
      ["Created", dateTime(deal.createdAt)],
      ["Completed", dateTime(deal.completedAt)],
      ["Escrow", deal.escrow ? `${humanize(deal.escrow.status.toLowerCase())} · funded ${inr(deal.escrow.fundedAmount)} · released ${inr(deal.escrow.releasedAmount)} · refunded ${inr(deal.escrow.refundedAmount)}` : "Not funded"],
    ])

    section(doc, "Milestones")
    table(
      doc,
      ["#", "Milestone", "Amount", "Due", "Status", "Submitted", "Approved", "Released"],
      [22, 120, 65, 58, 70, 55, 55, 50],
      deal.milestones.map((m) => [
        String(m.position),
        m.revisionCount ? `${m.title} (${m.revisionCount} revision${m.revisionCount > 1 ? "s" : ""})` : m.title,
        inr(m.amount),
        date(m.dueDate),
        humanize(m.status.toLowerCase()),
        date(m.submittedAt),
        date(m.approvedAt),
        date(m.releasedAt),
      ]),
    )

    section(doc, "Ledger")
    table(doc, ["Date", "Entry", "Amount", "Reference"], [110, 110, 90, 185], deal.ledger.map((l) => [dateTime(l.createdAt), humanize(l.type.toLowerCase()), inr(l.amount), l.providerRef ?? "-"]))
    if (totals.size) {
      doc.moveDown(0.4)
      kv(doc, [...totals.entries()].map(([type, amount]) => [`Total ${humanize(type.toLowerCase())}`, inr(amount)] as [string, string]))
    }
  })
}
