"use client"

import * as React from "react"
import type { Block } from "@blocknote/core"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import { SaveIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import { saveWikiPageAction, type WikiActionResult } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import { useWikiChatDock } from "@/components/wiki/wiki-chat-dock"
import type { WikiNodeRow, WikiRevisionRow } from "@/lib/wiki"
import { cn } from "@/lib/utils"

const EMPTY_CONTENT = [
  {
    type: "paragraph",
    content: "",
  },
]

function normalizeInitialBlocks(value: unknown) {
  return Array.isArray(value) && value.length
    ? (value as Block[])
    : EMPTY_CONTENT
}

export function WikiEditor({
  node,
  revision,
  canManage,
  isHistorical = false,
  lastUpdatedLabel,
}: {
  node: WikiNodeRow
  revision: WikiRevisionRow | null
  canManage: boolean
  isHistorical?: boolean
  lastUpdatedLabel?: string | null
}) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const { isOpen: isChatOpen } = useWikiChatDock()
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [isDirty, setIsDirty] = React.useState(false)
  const [blocks, setBlocks] = React.useState<unknown>(
    normalizeInitialBlocks(revision?.blocks)
  )

  const editor = useCreateBlockNote({
    initialContent: normalizeInitialBlocks(revision?.blocks),
    uploadFile: canManage
      ? async (file) => {
          const formData = new FormData()
          formData.set("node_id", node.id)
          formData.set("file", file)
          const response = await fetch("/api/wiki/upload", {
            method: "POST",
            body: formData,
          })
          const payload = (await response.json().catch(() => null)) as {
            url?: string
            error?: string
          } | null
          if (!response.ok || !payload?.url) {
            throw new Error(payload?.error ?? "Upload failed.")
          }
          router.refresh()
          return payload.url
        }
      : undefined,
    resolveFileUrl: async (url) => url,
  })

  function save() {
    const formData = new FormData()
    setState(null)
    formData.set("node_id", node.id)
    formData.set("blocks", JSON.stringify(blocks))

    startTransition(async () => {
      const result = await saveWikiPageAction(formData)
      setState(result)
      if (result.ok) {
        setIsDirty(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="wiki-blocknote-surface min-w-0 p-0">
        <BlockNoteView
          editor={editor}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          editable={canManage && !isHistorical}
          onChange={() => {
            setBlocks(editor.document)
            setIsDirty(true)
          }}
          className="w-full min-w-0"
        />
      </div>
      <div className="mt-auto flex min-h-11 items-center justify-between gap-3 pt-3 pb-4">
        <p className="text-xs text-muted-foreground/70">
          {lastUpdatedLabel ?? null}
        </p>
      </div>
      {canManage && !isHistorical && isDirty ? (
        <Button
          type="button"
          className={cn(
            "fixed right-6 bottom-6 z-40 h-12 bg-emerald-600 px-6 text-base text-white shadow-xl hover:bg-emerald-700",
            isChatOpen ? "lg:right-[calc(28rem+1.5rem)]" : null
          )}
          disabled={pending}
          onClick={save}
        >
          <SaveIcon />
          {pending ? "Saving..." : "Save Changes"}
        </Button>
      ) : null}
      {state && !state.ok ? (
        <p className="mt-2 text-sm text-destructive">{state.message}</p>
      ) : null}
    </div>
  )
}
