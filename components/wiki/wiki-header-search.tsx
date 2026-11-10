"use client"

import * as React from "react"
import Link from "next/link"
import { SparklesIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { useWikiChatModal } from "@/components/wiki/wiki-chat-modal"
import { cn } from "@/lib/utils"

export function WikiHeaderSearch({ className }: { className?: string }) {
  const { openWithPrompt, openWithDraft } = useWikiChatModal()
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<
    Array<{
      id: string
      title: string
      url: string
      type: string
      snippet: string
    }>
  >([])
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (query.trim().length < 2 || query.length > 200) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/wiki/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        )
        if (!response.ok) return
        const data = await response.json()
        setResults(
          data.results.filter(
            (result: { type: string }) => result.type === "wiki_tag"
          )
        )
      } catch {
        if (!controller.signal.aborted) setResults([])
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  function askMilo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    openWithPrompt(query)
    setQuery("")
    setResults([])
  }

  return (
    <form
      onSubmit={askMilo}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setFocused(false)
      }}
      className={cn("relative w-full max-w-xl", className)}
    >
      <button
        type="button"
        aria-label="Open Milo chat"
        onClick={() => {
          openWithDraft(query)
          setQuery("")
          setResults([])
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
            setResults([])
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setResults([])
        }}
        placeholder="Ask Milo"
        aria-label="Ask Milo"
        className="h-10 min-h-10 cursor-text bg-white pl-9 text-slate-950 caret-slate-950 [color-scheme:light] placeholder:text-slate-500 focus-visible:border-white focus-visible:ring-white/60 dark:border-white/10 dark:bg-[#1F1F1F] dark:text-white dark:caret-white dark:[color-scheme:dark] dark:placeholder:text-white/55 dark:focus-visible:border-white/20 dark:focus-visible:ring-white/20"
      />
      {focused && query.trim().length >= 2 && results.length ? (
        <div
          className="absolute top-full z-50 mt-1 w-full rounded-lg border bg-popover p-2 text-popover-foreground shadow-md"
          aria-label="Matching tags"
        >
          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            Tags
          </p>
          <ul>
            {results.map((result) => (
              <li key={result.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  href={result.url}
                  onClick={() => {
                    setQuery("")
                    setResults([])
                    setFocused(false)
                  }}
                >
                  <span>{result.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {result.snippet}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  )
}
