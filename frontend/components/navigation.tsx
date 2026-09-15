"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useTheme } from "next-themes"
import { ArrowRight, Menu, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Wordmark } from "@/components/marketing/wordmark"
import { portalPath } from "@/components/marketing/portal"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#brands", label: "For brands" },
  { href: "/#creators", label: "For creators" },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="text-muted-foreground hover:text-foreground"
    >
      {mounted ? dark ? <Sun className="size-4" /> : <Moon className="size-4" /> : <span className="size-4" />}
    </Button>
  )
}

export function Navigation() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  const signedIn = status === "authenticated"
  const dashboard = portalPath(session?.user?.role)

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-colors duration-300",
        scrolled ? "border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65" : "border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8" aria-label="Main">
        <Wordmark />

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = !l.href.includes("#") && pathname === l.href
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    active && "text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <div className="hidden items-center gap-1.5 sm:flex">
            {signedIn ? (
              <Button asChild size="sm" className="rounded-full px-4">
                <Link href={dashboard}>
                  Open dashboard <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/auth/signin">Log in</Link>
                </Button>
                <Button asChild size="sm" className="rounded-full px-4">
                  <Link href="/auth/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-xs p-0">
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle asChild>
                  <div>
                    <Wordmark href={null} size={24} />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <ul className="flex flex-col px-3">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-3 text-base font-medium text-foreground hover:bg-muted"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-2 border-t p-5">
                {signedIn ? (
                  <Button asChild className="w-full">
                    <Link href={dashboard}>Open dashboard</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild className="w-full">
                      <Link href="/auth/signup">Get started — it’s free</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/auth/signin">Log in</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
