import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/marketing/wordmark"

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-4 py-6 sm:px-10">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div aria-hidden className="absolute left-1/2 top-[-12rem] -z-10 h-[28rem] w-[50rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <Wordmark />
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center text-center">
        <p className="font-display text-8xl font-extrabold tracking-tight text-gradient sm:text-9xl">404</p>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">This page doesn&apos;t exist.</h1>
        <p className="mt-3 text-muted-foreground">The link may be broken, or the profile or brief was removed.</p>
        <Button asChild className="mt-8 h-11 rounded-full px-6">
          <Link href="/">
            <ArrowLeft /> Back home
          </Link>
        </Button>
      </main>
    </div>
  )
}
