import { Suspense } from "react"
import { PageHeader } from "@/components/app/ui"
import { AdminConsole } from "./_components/console"

export const metadata = { title: "Trust & safety · hustl." }

export default function AdminPage() {
  return (
    <div>
      <PageHeader title="Trust & safety" description="Resolve disputes, work the fraud queue, decide verifications and manage accounts." />
      <Suspense fallback={null}>
        <AdminConsole />
      </Suspense>
    </div>
  )
}
