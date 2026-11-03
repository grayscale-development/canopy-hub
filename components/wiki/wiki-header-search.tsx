"use client"

import * as React from "react"
import { SparklesIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { useWikiChatModal } from "@/components/wiki/wiki-chat-modal"
import { cn } from "@/lib/utils"

export function WikiHeaderSearch({ className }: { className?: string }) {
  const { openWithPrompt } = useWikiChatModal()
  const [query, setQuery] = React.useState("")

  function askMilo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    openWithPrompt(query)
    setQuery("")
  }

  return (
    <form onSubmit={askMilo} className={cn("relative w-full max-w-xl", className)}>
      <SparklesIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ask Milo"
        aria-label="Ask Milo"
        className="h-10 min-h-10 cursor-text bg-white pl-9 text-slate-950 caret-slate-950 [color-scheme:light] placeholder:text-slate-500 focus-visible:border-white focus-visible:ring-white/60 dark:border-white/10 dark:bg-[#1F1F1F] dark:text-white dark:caret-white dark:[color-scheme:dark] dark:placeholder:text-white/55 dark:focus-visible:border-white/20 dark:focus-visible:ring-white/20"
      />
    </form>
  )
}
