import type React from "react"
import type { Metadata } from "next"
import { Poppins } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"

// Poppins is the hustl. brand typeface (hustlstops.com).
const poppins = Poppins({ subsets: ["latin"], display: "swap", weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-poppins" })

export const metadata: Metadata = {
  title: { default: "hustl. — Brand deals, secured. Payments, guaranteed.", template: "%s · hustl." },
  description:
    "The creator–brand marketplace with escrow-protected payments, AI creator matching and a structured deal workflow from brief to payout.",
  icons: { icon: "/logo-mark.jpg", apple: "/logo-mark.jpg" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${poppins.variable} antialiased`} suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
