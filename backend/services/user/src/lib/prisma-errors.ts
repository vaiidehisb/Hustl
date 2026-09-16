import { Prisma } from "@hustl/db"

export const isUniqueViolation = (err: unknown): err is Prisma.PrismaClientKnownRequestError =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"

/** The columns/constraint named by a unique violation, as one lowercase string. */
export function uniqueTarget(err: Prisma.PrismaClientKnownRequestError) {
  const t = err.meta?.target
  return (Array.isArray(t) ? t.join(",") : String(t ?? "")).toLowerCase()
}

/**
 * Retries `fn` when it hits a unique violation that `retryable` accepts (e.g. a slug generated from a
 * snapshot that a concurrent request took first). Other errors propagate unchanged.
 */
export async function withUniqueRetry<T>(fn: () => Promise<T>, retryable: (target: string) => boolean, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i < attempts && isUniqueViolation(err) && retryable(uniqueTarget(err))) continue
      throw err
    }
  }
}
