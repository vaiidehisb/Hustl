"use client"

import { ApiErrorState } from "@/components/app/states"

export default function DealRoomError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ApiErrorState error={error} title="Couldn't load this deal" onRetry={reset} />
}
