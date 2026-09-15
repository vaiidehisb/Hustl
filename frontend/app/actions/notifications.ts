"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export async function markNotificationsRead() {
  const user = await getCurrentUser()
  if (!user) return
  await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
  revalidatePath("/", "layout")
}
