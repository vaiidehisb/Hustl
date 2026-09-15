"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar } from "@/components/app/ui"
import { sendMessageAction } from "@/app/actions/deals"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useAction } from "./use-action"

type Msg = { id: string; body: string; createdAt: string; sender: { id: string; name: string; image: string | null } }

// Polls for new messages; swap for the Socket.io channel when the realtime
// service lands.
const POLL_MS = 8000

export function DealChat({ dealId, currentUserId, messages, disabled }: { dealId: string; currentUserId: string; messages: Msg[]; disabled?: boolean }) {
  const router = useRouter()
  const { pending, exec } = useAction()
  const [body, setBody] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), POLL_MS)
    return () => clearInterval(t)
  }, [router])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const send = () => {
    if (!body.trim()) return
    const text = body
    exec(() => sendMessageAction(dealId, text), undefined, () => setBody(""))
  }

  return (
    <div>
      <div ref={listRef} className="max-h-[420px] min-h-40 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — say hello and align on the brief.</p>}
        {messages.map((m) => {
          const mine = m.sender.id === currentUserId
          return (
            <div key={m.id} className={cn("flex items-end gap-2.5", mine && "flex-row-reverse")}>
              <Avatar name={m.sender.name} src={m.sender.image} size={28} />
              <div className={cn("max-w-[78%]", mine && "text-right")}>
                <div className={cn("inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
                  {m.body}
                </div>
                <div className="mt-1 px-1 text-[11px] text-muted-foreground">
                  {mine ? "You" : m.sender.name} · {timeAgo(m.createdAt)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {!disabled && (
        <div className="flex items-end gap-2 border-t p-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
            className="min-h-10 resize-none"
            aria-label="Message"
          />
          <Button size="icon" onClick={send} disabled={pending || !body.trim()} aria-label="Send message">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </Button>
        </div>
      )}
    </div>
  )
}
