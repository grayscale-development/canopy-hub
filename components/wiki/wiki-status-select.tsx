"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { WikiNodeRow } from "@/lib/wiki"

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={pending}
            className={value === "published" ? "text-success" : undefined}
          >
            <span
              aria-hidden="true"
              className={
                value === "published"
                  ? "size-2 rounded-full bg-success"
                  : "size-2 rounded-full bg-muted-foreground"
              }
            />
            {STATUS_OPTIONS.find((option) => option.value === value)?.label ??
              "Draft"}
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => requestStatus(option.value)}
            >
              <span
                className={
                  option.value === "published" ? "text-success" : undefined
                }
              >
                {option.label}
              </span>
              {value === option.value ? (
                <CheckIcon aria-hidden="true" className="ml-auto" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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
