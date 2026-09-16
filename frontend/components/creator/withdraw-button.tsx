"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { withdrawApplicationAction } from "@/app/actions/creator"

export function WithdrawButton({ applicationId, briefTitle, size = "sm" }: { applicationId: string; briefTitle: string; size?: "sm" | "default" }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const withdraw = () =>
    startTransition(async () => {
      const res = await withdrawApplicationAction(applicationId)
      if (!res.ok) {
        // 409: the brand already moved the application on (offer sent, rejected…).
        toast.error(res.error.message)
        router.refresh()
        return
      }
      toast.success("Application withdrawn", { description: "You can re-apply while the brief is still live." })
      router.refresh()
    })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size={size} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
          Withdraw
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw your application?</AlertDialogTitle>
          <AlertDialogDescription>
            The brand will be notified that you&apos;ve withdrawn from “{briefTitle}”. You can re-apply later if the brief is still accepting applications.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep application</AlertDialogCancel>
          <AlertDialogAction onClick={withdraw}>Withdraw</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
