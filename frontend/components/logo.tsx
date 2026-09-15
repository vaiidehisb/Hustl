import { motion } from "framer-motion"
import Image from "next/image"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
  animated?: boolean
}

export function Logo({ className = "", size = "md", animated = false }: LogoProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8", 
    lg: "h-12 w-12"
  }

  const LogoComponent = (
    <Image
      src="/LOGO.png"
      alt="Hustl Logo"
      width={size === "sm" ? 24 : size === "md" ? 32 : 48}
      height={size === "sm" ? 24 : size === "md" ? 32 : 48}
      className={`${sizeClasses[size]} ${className} object-contain`}
      priority={size === "lg"}
    />
  )

  if (animated) {
    return (
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        {LogoComponent}
      </motion.div>
    )
  }

  return LogoComponent
} 