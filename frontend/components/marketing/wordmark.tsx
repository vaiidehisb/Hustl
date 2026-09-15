import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

/** Server-safe logo + "hustl." wordmark (components/logo.tsx pulls in framer-motion). */
export function Wordmark({ className, href = "/", size = 28 }: { className?: string; href?: string | null; size?: number }) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image src="/LOGO.png" alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} />
      <span className="font-display text-xl font-extrabold tracking-tight">
        hustl<span className="text-primary">.</span>
      </span>
    </span>
  )
  if (!href) return inner
  return (
    <Link href={href} aria-label="hustl. home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {inner}
    </Link>
  )
}
