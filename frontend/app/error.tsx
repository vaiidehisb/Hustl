"use client"

import { useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/marketing/wordmark"
import { ApiErrorState } from "@/components/app/states"
import { isApiError } from "@/lib/api/errors"

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="relative isolate flex min-h-dvh flex-col px-4 py-6 sm:px-10">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <Wordmark />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center text-center">
        {isApiError(error) ? (
          <ApiErrorState error={error} onRetry={reset} className="w-full" />
        ) : (
          <>
            <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-primary">Something broke</p>
            <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
              We hit a snag <span className="text-gradient">loading this page.</span>
            </h1>
            <p className="mt-4 text-muted-foreground">It might be a temporary problem with our services. Try again, or head back home.</p>
            {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button onClick={reset} className="h-11 rounded-full px-6">
                <RotateCw /> Try again
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-full px-6">
                <Link href="/">
                  <ArrowLeft /> Back home
                </Link>
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
