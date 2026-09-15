import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db

/** Prisma `Json` columns come back as `unknown`; narrow them at the edge. */
export function json<T>(value: unknown, fallback: T): T {
  return (value ?? fallback) as T
}
