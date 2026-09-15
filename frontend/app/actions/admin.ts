"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/session"
import { run } from "./result"

/** Manual review passed: clear fraud flags and lift the score out of the queue. */
export async function clearCreatorFlagsAction(creatorId: string) {
  return run(async () => {
    await requireAdmin()
    const c = await db.creatorProfile.update({
      where: { id: creatorId },
      data: { fraudFlags: [], authenticityScore: 70 },
    })
    await db.notification.create({
      data: { userId: c.userId, title: "Your profile passed authenticity review", body: "You're visible in brand search again.", href: "/creator/analytics" },
    })
    revalidatePath("/admin")
  })
}
