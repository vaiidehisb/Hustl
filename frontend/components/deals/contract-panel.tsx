// Renders the structured contract terms the deal service generated.
// Server-safe; the signing dialog itself is a client component.
import { Download, FileSignature } from "lucide-react"
import type { ContractDTO, ContractSignatureDTO } from "@hustl/contracts"
import { Panel, Pill } from "@/components/app/ui"
import { inr, shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MODE_LABEL } from "./status"

export function ContractPanel({ contract, dealId, action }: { contract: ContractDTO | null; dealId: string; action?: React.ReactNode }) {
  if (!contract) {
    return (
      <Panel title="Contract" description="Generated automatically once both sides agree on terms.">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSignature className="size-4" /> The contract appears here as soon as an offer is accepted.
        </p>
      </Panel>
    )
  }

  const t = contract.terms
  const pct = (n: number | undefined) => (typeof n === "number" ? `${Math.round(n * 100)}%` : "—")

  return (
    <Panel
      title="Contract"
      description={`Version ${t.version} · generated from the agreed offer (round ${t.agreedOfferRound}). E-signatures are binding under the IT Act, 2000.`}
      action={
        contract.fullySigned ? (
          <a
            href={`/api/gateway/media/contracts/${encodeURIComponent(dealId)}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Download className="size-3.5" /> Download contract PDF
          </a>
        ) : (
          action
        )
      }
    >
      <div className="space-y-4 text-sm leading-relaxed">
        <Clause n={1} title="Parties">
          {t.parties.brand.companyName} (“Brand”), signing as {t.parties.brand.signatoryName || "—"}, and {t.parties.creator.signatoryName || t.parties.creator.handle} (@
          {t.parties.creator.handle}, “Creator”), through the hustl. marketplace.
        </Clause>
        <Clause n={2} title="Scope of work">
          <span className="font-medium text-foreground">{t.scope.title}</span> — {t.scope.deliverables}
        </Clause>
        <Clause n={3} title="Compensation">
          {inr(t.compensation.amount)} ({t.compensation.currency}) · {MODE_LABEL[t.compensation.paymentMode]}. Fees: brand {pct(t.compensation.feeRates.brand)}, processing{" "}
          {pct(t.compensation.feeRates.processing)}, creator {pct(t.compensation.feeRates.creator)}.
          {t.compensation.milestones.length > 0 && (
            <ul className="mt-2 space-y-1">
              {t.compensation.milestones.map((m) => (
                <li key={m.position} className="flex justify-between gap-3 rounded-md bg-muted/60 px-3 py-1.5">
                  <span>
                    {m.position + 1}. {m.title}
                    {m.dueDate && <span className="text-muted-foreground"> · due {shortDate(m.dueDate)}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {m.percent}% · {inr(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Clause>
        <Clause n={4} title="Escrow">
          {t.escrow.fundedBeforeWork ? "The brand funds the full amount into hustl. escrow before work begins. " : ""}
          Release trigger: {t.escrow.releaseTrigger}. Either party may raise a dispute within {t.disputes.windowHours} hours of a submission; releases freeze until it is resolved.
        </Clause>
        <Clause n={5} title="Disclosure & usage rights">
          {t.disclosure.required ? `Creator labels sponsored content per ${t.disclosure.standard} influencer guidelines. ` : ""}
          Brand may use the delivered content for {t.usageRights.days} days.
        </Clause>
        <Clause n={6} title="Timeline">{t.timeline.dueDate ? `Final deliverables due by ${shortDate(t.timeline.dueDate)}.` : "As agreed per milestone."}</Clause>
        {t.clauses.map((c, i) => (
          <Clause key={c.id} n={7 + i} title={c.heading}>
            {c.body}
          </Clause>
        ))}
      </div>

      <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <Signature who={t.parties.brand.companyName} signature={contract.signatures.brand} />
        <Signature who={t.parties.creator.signatoryName || `@${t.parties.creator.handle}`} signature={contract.signatures.creator} />
      </div>
      {!contract.fullySigned && (
        <p className="mt-3 text-xs text-muted-foreground">
          <Pill tone="warning">Awaiting signatures</Pill> <span className="ml-1">Escrow can only be funded once both parties have signed.</span>
        </p>
      )}
    </Panel>
  )
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="font-mono text-xs text-muted-foreground">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

function Signature({ who, signature }: { who: string; signature: ContractSignatureDTO }) {
  return (
    <div className={cn("rounded-lg border p-3", signature.signedAt ? "bg-success-soft/60" : "border-dashed")}>
      <div className="text-xs text-muted-foreground">{signature.signedAt ? "Signed by" : "Awaiting signature"}</div>
      <div className={cn("mt-0.5 font-medium", signature.signedAt && "font-display italic")}>{signature.signerName || who}</div>
      {signature.signedAt && <div className="text-[11px] text-muted-foreground">{new Date(signature.signedAt).toLocaleString("en-IN")}</div>}
    </div>
  )
}
