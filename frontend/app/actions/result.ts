import { DealTransitionError } from "@/lib/deals/machine"

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

/** Runs a server-action body and turns domain errors into a serialisable result. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    if (err instanceof DealTransitionError || (err instanceof Error && err.name === "ValidationError")) return { ok: false, error: err.message }
    if (err instanceof Error && /digest|NEXT_REDIRECT/.test(err.message)) throw err
    console.error(err)
    return { ok: false, error: err instanceof Error && err.message.startsWith("Milestone") ? err.message : "Something went wrong. Please try again." }
  }
}

export class ValidationError extends Error {
  name = "ValidationError"
}
