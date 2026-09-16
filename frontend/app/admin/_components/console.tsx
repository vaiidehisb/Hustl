"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DisputesTab } from "./disputes"
import { FraudFlagsTab } from "./fraud-flags"
import { MetricsTab } from "./metrics"
import { UsersTab } from "./users"
import { VerificationsTab } from "./verifications"

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "disputes", label: "Disputes" },
  { value: "fraud", label: "Fraud review" },
  { value: "verifications", label: "Verifications" },
  { value: "users", label: "Users" },
] as const

export function AdminConsole() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = TABS.find((t) => t.value === params.get("tab"))?.value ?? "overview"

  return (
    <Tabs value={tab} onValueChange={(next) => router.replace(next === "overview" ? pathname : `${pathname}?tab=${next}`, { scroll: false })}>
      <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview">
        <MetricsTab />
      </TabsContent>
      <TabsContent value="disputes">
        <DisputesTab />
      </TabsContent>
      <TabsContent value="fraud">
        <FraudFlagsTab />
      </TabsContent>
      <TabsContent value="verifications">
        <VerificationsTab />
      </TabsContent>
      <TabsContent value="users">
        <UsersTab />
      </TabsContent>
    </Tabs>
  )
}
