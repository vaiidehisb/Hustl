"use client"

import { useEffect } from "react"
import { ApiErrorState } from "@/components/app/states"

export default function CreatorPortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="py-10">
      <ApiErrorState error={error} onRetry={reset} title="This page didn't load" />
      {error.digest && <p className="mt-3 text-center font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
    </div>
  )
}
