"use client"
// GET /admin/users + PATCH /admin/users/:id/status
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Search, Users } from "lucide-react"
import type { AdminUserListItem, PageMeta, Role } from "@hustl/contracts"
import { Avatar, Pill } from "@/components/app/ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { browserFetchWithMeta } from "@/lib/api/browser"
import { setUserStatusAction } from "@/app/actions/admin"
import { useApiAction } from "@/components/deals/use-deal-action"
import { shortDate } from "@/lib/format"
import { AdminSection } from "./section"

const ROLES: (Role | "ALL")[] = ["ALL", "BRAND", "CREATOR", "ADMIN"]

export function UsersTab() {
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const [role, setRole] = useState<Role | "ALL">("ALL")
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ["admin", "users", { search, role, page }],
    queryFn: ({ signal }) =>
      browserFetchWithMeta<AdminUserListItem[], PageMeta>("/admin/users", {
        query: { page, pageSize: 20, ...(search ? { q: search } : {}), ...(role !== "ALL" ? { role } : {}) },
        signal,
      }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-52 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setSearch(q.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-9" aria-label="Search users" />
        </form>
        {ROLES.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={r === role ? "default" : "outline"}
            onClick={() => {
              setPage(1)
              setRole(r)
            }}
          >
            {r.toLowerCase()}
          </Button>
        ))}
      </div>

      <AdminSection query={query} isEmpty={(d) => d.data.length === 0} emptyIcon={Users} emptyTitle="No users match" emptyDescription="Try a different search or role filter." skeletonRows={5}>
        {(d) => (
          <>
            <div className="overflow-hidden rounded-xl border bg-card">
              <ul className="divide-y">
                {d.data.map((user) => (
                  <li key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={user.name} size={36} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{user.name}</span>
                          <Pill tone={user.status === "SUSPENDED" ? "danger" : "neutral"}>{user.status.toLowerCase()}</Pill>
                          {user.role && <Pill tone="info">{user.role.toLowerCase()}</Pill>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {user.email}
                          {user.creator && ` · @${user.creator.handle}`}
                          {user.brand && ` · ${user.brand.companyName}`}
                          {` · joined ${shortDate(user.createdAt)}`}
                        </div>
                      </div>
                    </div>
                    <StatusDialog user={user} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {d.meta?.page ?? page} of {d.meta?.totalPages ?? 1} · {d.meta?.total ?? d.data.length} users
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={!!d.meta?.totalPages && page >= d.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </AdminSection>
    </div>
  )
}

function StatusDialog({ user }: { user: AdminUserListItem }) {
  const qc = useQueryClient()
  const { pending, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const suspending = user.status !== "SUSPENDED"

  const submit = () =>
    void run(() => setUserStatusAction(user.id, { status: suspending ? "SUSPENDED" : "ACTIVE", ...(reason.trim() ? { reason: reason.trim() } : {}) }), {
      success: suspending ? "Account suspended" : "Account reactivated",
      onSuccess: () => {
        setOpen(false)
        setReason("")
        void qc.invalidateQueries({ queryKey: ["admin"] })
      },
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={suspending ? "outline" : "default"}>
          {suspending ? "Suspend" : "Activate"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {suspending ? "Suspend" : "Reactivate"} {user.name}?
          </DialogTitle>
          <DialogDescription>
            {suspending
              ? "A suspended user can't sign in. Deals already funded keep their escrow protection."
              : "The user can sign in again immediately."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`status-reason-${user.id}`}>Reason (internal)</Label>
          <Textarea id={`status-reason-${user.id}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Repeated fraudulent submissions confirmed in review." />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={suspending ? "destructive" : "default"} disabled={pending} onClick={submit}>
            {pending && <Loader2 className="size-4 animate-spin" />} {suspending ? "Suspend account" : "Reactivate account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
