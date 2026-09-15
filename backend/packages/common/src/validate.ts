import type { z } from "zod"
import { errors } from "./errors"

/** Parse untrusted input; throws a 422 VALIDATION_ERROR with field details. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input)
  if (!r.success) throw errors.validation("Invalid request", r.error.flatten())
  return r.data
}

export type Page = { page: number; pageSize: number }
export const pageMeta = (p: Page, total: number) => ({ page: p.page, pageSize: p.pageSize, total, totalPages: Math.ceil(total / p.pageSize) })
