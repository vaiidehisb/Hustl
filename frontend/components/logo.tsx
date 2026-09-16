"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { brandMark } from "@/components/marketing/portal"

const SIZES = { sm: 24, md: 32, lg: 48 } as const

interface LogoProps {
  className?: string
  size?: keyof typeof SIZES
  animated?: boolean
}

/** The hustl. mark — lime "H." on black. */
export function Logo({ className, size = "md", animated = false }: LogoProps) {
  const px = SIZES[size]
  const mark = (
    <Image
      src={brandMark}
      alt="hustl."
      width={px}
      height={px}
      priority={size === "lg"}
      className={cn("rounded-[22%] object-contain", className)}
      style={{ width: px, height: px }}
    />
  )
  return animated ? (
    <motion.span whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} transition={{ duration: 0.2 }} className="inline-flex">
      {mark}
    </motion.span>
  ) : (
    mark
  )
}
