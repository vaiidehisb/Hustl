"use client"

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { compact, inr } from "@/lib/format"

export type SpendPoint = { month: string; escrow: number; fees: number }

function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums">{inr(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-1 flex justify-between gap-6 border-t pt-1 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{inr(total)}</span>
        </div>
      )}
    </div>
  )
}

export function SpendChart({ data, height = 240 }: { data: SpendPoint[]; height?: number }) {
  const empty = data.every((d) => d.escrow + d.fees === 0)
  return (
    <div className="relative" style={{ height }}>
      {empty && (
        <div className="absolute inset-0 z-10 grid place-items-center text-sm text-muted-foreground">No spend yet — funded deals show up here.</div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => (v ? `₹${compact(v)}` : "0")}
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<MoneyTooltip />} />
          <Bar dataKey="escrow" name="Creator payments" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} maxBarSize={36} />
          <Bar dataKey="fees" name="Fees" stackId="a" fill="var(--chart-2, var(--muted-foreground))" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export type StatusPoint = { label: string; count: number; color: string }

export function StatusChart({ data, height = 240 }: { data: StatusPoint[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                  {String(payload[0].payload.label)}: <span className="font-medium tabular-nums">{String(payload[0].value)}</span>
                </div>
              ) : null
            }
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
