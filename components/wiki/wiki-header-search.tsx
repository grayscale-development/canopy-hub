"use client"

import * as React from "react"
import { SparklesIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { useWikiChatModal } from "@/components/wiki/wiki-chat-modal"
import { cn } from "@/lib/utils"

export function WikiHeaderSearch({ className }: { className?: string }) {
  const { openWithPrompt, openWithDraft } = useWikiChatModal()
  const [query, setQuery] = React.useState("")
  function askMilo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    openWithPrompt(query)
    setQuery("")
  }

  return (
    <form
      onSubmit={askMilo}
      className={cn("relative w-full max-w-xl", className)}
    >
      <button
        type="button"
        aria-label="Open Milo chat"
        onClick={() => {
          openWithDraft(query)
          setQuery("")
        }}
        className="absolute top-0 left-0 z-10 flex size-10 items-center justify-center rounded-md text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <SparklesIcon className="size-4" />
      </button>
      <Input
        type="text"
        value={query}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text")
          if (pasted.includes("\n") || pasted.length > 200) {
            event.preventDefault()
            const start = event.currentTarget.selectionStart ?? query.length
            const end = event.currentTarget.selectionEnd ?? start
            openWithDraft(query.slice(0, start) + pasted + query.slice(end))
            setQuery("")
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
        placeholder="Ask Milo"
        aria-label="Ask Milo"
        className="h-10 min-h-10 cursor-text bg-white pl-9 text-slate-950 caret-slate-950 [color-scheme:light] placeholder:text-slate-500 focus-visible:border-white focus-visible:ring-white/60 dark:border-white/10 dark:bg-[#1F1F1F] dark:text-white dark:caret-white dark:[color-scheme:dark] dark:placeholder:text-white/55 dark:focus-visible:border-white/20 dark:focus-visible:ring-white/20"
      />
    </form>
  )
}
