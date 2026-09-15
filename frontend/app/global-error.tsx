"use client"

import "./globals.css"

// Replaces the root layout when it fails, so no providers or fonts are available here.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
          <span className="font-display text-2xl font-extrabold tracking-tight">hustl.</span>
          <h1 className="mt-10 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            Something went <span className="text-gradient">wrong.</span>
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            hustl. couldn&apos;t load. This is usually temporary. Please try again.
          </p>
          {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
          <div className="mt-8 flex gap-3">
            <button
              onClick={reset}
              className="h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="grid h-11 place-items-center rounded-full border px-6 text-sm font-semibold transition hover:bg-muted">
              Back home
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
