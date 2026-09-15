import { PrismaClient } from "@prisma/client"

export * from "@prisma/client"

const g = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  g.prisma ??
  new PrismaClient({
    log: process.env.LOG_LEVEL === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
  })

if (process.env.NODE_ENV !== "production") g.prisma = prisma
