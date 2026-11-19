"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
  const [type, setType] = React.useState<(typeof types)[number]>("bug")
  const [message, setMessage] = React.useState("")
  const [includePage, setIncludePage] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState("")

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
      setType("bug")
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
          <DialogTitle>Submit feedback</DialogTitle>
          <DialogDescription>
            Tell us what is working or what could be better.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Type</legend>
            <div className="flex flex-wrap gap-2">
              {types.map((option) => (
                <label key={option} className="cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="feedback-type"
                    value={option}
                    checked={type === option}
                    onChange={() => setType(option)}
                  />
                  <span className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm capitalize peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                    {option[0].toUpperCase() + option.slice(1)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="feedback-message" className="text-sm font-medium">
              Message
            </label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              maxLength={5000}
              rows={5}
              aria-describedby="feedback-count"
            />
            <p
              id="feedback-count"
              className="text-right text-xs text-muted-foreground"
            >
              {message.length} / 5,000
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-primary"
              checked={includePage}
              onChange={(event) => setIncludePage(event.target.checked)}
            />
            <span>Include this page</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !message.trim()}>
              {pending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
