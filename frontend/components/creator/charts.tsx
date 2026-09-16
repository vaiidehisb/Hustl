"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { compact, inr } from "@/lib/format"

const tick = { fontSize: 12, fill: "var(--muted-foreground)" }

type TipProps = {
  active?: boolean
  label?: string
  payload?: { name?: string; value?: number; color?: string; dataKey?: string | number }[]
  money?: boolean
}

function ChartTooltip({ active, label, payload, money = true }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{money ? inr(p.value ?? 0) : compact(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

export function EarningsChart({
  data,
  showFees = false,
  height = 240,
}: {
  data: { label: string; net: number; fee?: number }[]
  showFees?: boolean
  height?: number
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} />
          <YAxis tickLine={false} axisLine={false} tick={tick} width={56} tickFormatter={(v: number) => (v ? `₹${compact(v)}` : "0")} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip />} />
          <Bar dataKey="net" name="Paid to you" stackId="a" fill="var(--chart-1)" radius={showFees ? [0, 0, 0, 0] : [6, 6, 0, 0]} maxBarSize={44} />
          {showFees && <Bar dataKey="fee" name="Platform fee" stackId="a" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={44} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PlatformChart({ data }: { data: { label: string; followers: number }[] }) {
  return (
    <div style={{ height: Math.max(140, data.length * 56) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={tick} tickFormatter={(v: number) => compact(v)} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={tick} width={76} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip money={false} />} />
          <Bar dataKey="followers" name="Followers" fill="var(--chart-1)" radius={[0, 6, 6, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
