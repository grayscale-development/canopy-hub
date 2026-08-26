"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { updateWikiNodeStatusAction } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { WikiNodeRow } from "@/lib/wiki"
import { cn } from "@/lib/utils"

type PublishableWikiStatus = Extract<
  WikiNodeRow["status"],
  "draft" | "published"
>

const STATUS_OPTIONS: Array<{
  value: PublishableWikiStatus
  label: string
}> = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
]

export function WikiStatusSelect({
  nodeId,
  status,
}: {
  nodeId: string
  status: WikiNodeRow["status"]
}) {
  const router = useRouter()
  const [value, setValue] = React.useState<WikiNodeRow["status"]>(status)
  const [requestedStatus, setRequestedStatus] =
    React.useState<PublishableWikiStatus | null>(null)
  const [pending, startTransition] = React.useTransition()

  function updateStatus(nextStatus: PublishableWikiStatus) {
    setValue(nextStatus)
    const formData = new FormData()
    formData.set("node_id", nodeId)
    formData.set("status", nextStatus)
    startTransition(async () => {
      const result = await updateWikiNodeStatusAction(formData)
      if (!result.ok) {
        setValue(status)
      }
      setRequestedStatus(null)
      router.refresh()
    })
  }

  function requestStatus(nextStatus: PublishableWikiStatus) {
    if (nextStatus === value || pending) {
      return
    }
    setRequestedStatus(nextStatus)
  }

  const requestedStatusLabel = STATUS_OPTIONS.find(
    (option) => option.value === requestedStatus
  )?.label

  return (
    <>
      <div className="inline-flex h-10 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {STATUS_OPTIONS.map((option) => {
          const isSelected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              aria-pressed={isSelected}
              onClick={() => requestStatus(option.value)}
              className={cn(
                "h-9 min-w-24 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                option.value === "published" && isSelected
                  ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
                  : null,
                option.value === "draft" && isSelected
                  ? "bg-zinc-500 text-white shadow-sm hover:bg-zinc-600 dark:bg-zinc-400 dark:text-zinc-950 dark:hover:bg-zinc-300"
                  : null,
                !isSelected
                  ? "text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-zinc-800"
                  : null
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <Dialog
        open={Boolean(requestedStatus)}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setRequestedStatus(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Wiki Status</DialogTitle>
            <DialogDescription>
              This will switch the Wiki item to {requestedStatusLabel}. You can
              change it again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setRequestedStatus(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!requestedStatus || pending}
              onClick={() => {
                if (requestedStatus) {
                  updateStatus(requestedStatus)
                }
              }}
            >
              {pending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
