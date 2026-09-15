"use client"

import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { signOut } from "next-auth/react"
import { useTheme } from "next-themes"
import { LogOut, Moon, Sun, Home } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { initials } from "@/lib/format"
import { useUiStore } from "@/store/ui"

export function UserMenu({ user, compact }: { user: { name: string; email: string; image: string | null }; compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const qc = useQueryClient()

  // NextAuth's signOut event revokes the refresh token via POST /auth/logout.
  const onSignOut = async () => {
    useUiStore.getState().reset()
    qc.clear()
    await signOut({ callbackUrl: "/" })
  }

  const avatar = user.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.image} alt="" className="size-8 rounded-full object-cover" />
  ) : (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-semibold text-white">{initials(user.name)}</span>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={compact ? "rounded-full" : "flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sidebar-accent"}>
        {avatar}
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/">
            <Home className="size-4" /> Public site
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void onSignOut()}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
