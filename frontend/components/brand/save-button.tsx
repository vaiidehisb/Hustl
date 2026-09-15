"use client"

import { useState, useTransition } from "react"
import { Bookmark, BookmarkCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { toggleSaveCreatorAction } from "@/app/actions/brand"
import { cn } from "@/lib/utils"

export function SaveCreatorButton({ creatorId, saved: initial, name }: { creatorId: string; saved: boolean; name: string }) {
  const [saved, setSaved] = useState(initial)
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8", saved && "text-primary")}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      title={saved ? "Saved" : "Save creator"}
      disabled={pending}
      onClick={() => {
        const next = !saved
        setSaved(next)
        start(async () => {
          const res = await toggleSaveCreatorAction(creatorId)
          if (!res.ok) {
            setSaved(!next)
            toast.error(res.error)
          } else toast.success(next ? `Saved ${name}` : `Removed ${name} from saved`)
        })
      }}
    >
      {saved ? <BookmarkCheck className="size-4 fill-current" /> : <Bookmark className="size-4" />}
    </Button>
  )
}
