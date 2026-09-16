"use client"

import { useEffect, useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider, signOut, useSession } from "next-auth/react"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { useRealtime } from "@/hooks/use-realtime"
import { makeQueryClient } from "@/lib/query-client"
import { useUiStore } from "@/store/ui"

/** Ends the session client-side when the refresh token was rejected. */
function SessionGuard() {
  const { data } = useSession()
  const error = data?.error
  useEffect(() => {
    if (error !== "RefreshTokenError") return
    useUiStore.getState().reset()
    void signOut({ callbackUrl: "/auth/signin?expired=1" })
  }, [error])
  return null
}

function RealtimeBridge() {
  const { data, status } = useSession()
  useRealtime({ enabled: status === "authenticated" && !data?.error })
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <SessionGuard />
          <RealtimeBridge />
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
