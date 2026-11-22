"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const types = ["bug", "idea", "question", "other"] as const

export function FeedbackDialog({ trigger }: { trigger: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState<(typeof types)[number]>("other")
  const [showType, setShowType] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [includePage, setIncludePage] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState("")
  const focusType = React.useCallback((node: HTMLSelectElement | null) => {
    node?.focus()
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!message.trim() || pending) return
    setPending(true)
    setError("")
    try {
      const supabase = createSupabaseBrowserClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Please sign in and try again.")
      const { error: insertError } = await supabase
        .from("feedback_items")
        .insert({
          created_by: user.id,
          type,
          message: message.trim(),
          page_path: includePage ? pathname : null,
        })
      if (insertError)
        throw new Error("Could not send feedback. Please try again.")
      setOpen(false)
      setMessage("")
      setType("other")
      setShowType(false)
      setIncludePage(true)
      toast.success("Thanks, we read every message.")
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send feedback. Please try again."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-auto bottom-0 left-0 max-h-[90dvh] w-full translate-x-0 translate-y-0 overflow-y-auto rounded-b-none sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(92vw,36rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
      >
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-1"
            aria-label="Close"
          >
            ×
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>Share your thoughts with us.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <label htmlFor="feedback-message" className="sr-only">
              Message
            </label>
            <textarea
              className="block w-full rounded-md border bg-background px-3 pt-2 pb-8 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              id="feedback-message"
              placeholder="What's working, or what could be better?"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              maxLength={5000}
              rows={5}
              aria-describedby={
                message.length >= 4500 ? "feedback-count" : undefined
              }
            />
            {message.length >= 4500 && (
              <p
                id="feedback-count"
                className="pointer-events-none absolute right-3 bottom-2 bg-background text-xs text-muted-foreground"
              >
                {message.length} / 5,000
              </p>
            )}
          </div>
          {showType ? (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span>Type</span>
              <select
                ref={focusType}
                value={type}
                onChange={(event) =>
                  setType(event.target.value as (typeof types)[number])
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {types.map((option) => (
                  <option key={option} value={option}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setShowType(true)}
              className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Add a type
            </button>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              id="feedback-include-page"
              checked={includePage}
              onCheckedChange={setIncludePage}
            />
            <label htmlFor="feedback-include-page">
              Includes a link to this page
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || !message.trim()}>
              {pending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
