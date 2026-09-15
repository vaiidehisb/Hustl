import type React from "react"
import type { Metadata } from "next"
import { Geist, Manrope } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"

const geist = Geist({ subsets: ["latin"], display: "swap", variable: "--font-geist" })
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" })

export const metadata: Metadata = {
  title: { default: "hustl. — Brand deals, secured. Payments, guaranteed.", template: "%s · hustl." },
  description:
    "The creator–brand marketplace with escrow-protected payments, AI creator matching and a structured deal workflow from brief to payout.",
  icons: { icon: "/LOGO.png" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${manrope.variable} antialiased`} suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
