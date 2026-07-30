"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  FileTextIcon,
  Loader2Icon,
  NewspaperIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWikiChatDock } from "@/components/wiki/wiki-chat-dock"
import { cn } from "@/lib/utils"

interface WikiSearchResult {
  id: string
  title: string
  url: string
  type: string
  typeLabel: string
  snippet: string
}

function ResultIcon({ type }: { type: string }) {
  if (type === "newsletter") {
    return <NewspaperIcon className="size-4" />
  }

  return <FileTextIcon className="size-4" />
}

export function WikiHeaderSearch({ className }: { className?: string }) {
  const router = useRouter()
  const { isAuthenticated, hasBetaAccess, openWithPrompt } = useWikiChatDock()
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<WikiSearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const trimmedQuery = query.trim()

  React.useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([])
      setError(null)
      setIsLoading(false)
      return
    }

    const abortController = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/wiki/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: abortController.signal }
        )
        const payload = (await response.json().catch(() => null)) as {
          results?: WikiSearchResult[]
          error?: string
        } | null

        if (!response.ok) {
          setError(payload?.error ?? "Search failed.")
          setResults([])
          return
        }

        setResults(payload?.results ?? [])
      } catch (searchError) {
        if ((searchError as Error).name !== "AbortError") {
          setError("Search failed.")
          setResults([])
        }
      } finally {
        setIsLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timeout)
      abortController.abort()
    }
  }, [trimmedQuery])

  function openResult(result: WikiSearchResult) {
    setIsOpen(false)
    setQuery("")
    setResults([])
    router.push(result.url)
  }

  function askMilo() {
    setIsOpen(false)
    openWithPrompt(trimmedQuery)
  }

  const showPanel = isOpen && trimmedQuery.length >= 2

  return (
    <div className={cn("relative w-full max-w-xl", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={query}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setIsOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false)
            event.currentTarget.blur()
          }
        }}
        placeholder="Search the Hub"
        className="min-h-12 bg-white pr-10 pl-9 text-slate-950 caret-slate-950 [color-scheme:light] placeholder:text-slate-500 focus-visible:border-white focus-visible:ring-white/60 dark:border-white/10 dark:bg-[#1F1F1F] dark:text-white dark:caret-white dark:[color-scheme:dark] dark:placeholder:text-white/55 dark:focus-visible:border-white/20 dark:focus-visible:ring-white/20"
      />
      {isLoading ? (
        <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full text-slate-600 hover:text-slate-950"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setQuery("")
            setResults([])
            setError(null)
          }}
          aria-label="Clear wiki search"
        >
          <XIcon />
        </Button>
      ) : null}

      {showPanel ? (
        <div className="absolute top-full left-0 z-[1000] mt-2 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          {error ? (
            <div className="px-3 py-3 text-sm text-destructive">{error}</div>
          ) : isLoading && !results.length ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              Searching...
            </div>
          ) : results.length ? (
            <div className="max-h-[min(60vh,28rem)] overflow-y-auto py-1">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openResult(result)}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ResultIcon type={result.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {result.title}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
                        {result.typeLabel}
                      </span>
                    </span>
                    {result.snippet ? (
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                        {result.snippet}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3 px-3 py-3 text-sm text-muted-foreground">
              <p>No results found.</p>
              {isAuthenticated && hasBetaAccess ? (
                <Button
                  type="button"
                  className={cn(
                    "relative min-h-10 w-full overflow-hidden border-0 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_20px_rgba(37,99,235,0.2)] transition-all duration-300 ease-out hover:brightness-110 focus-visible:ring-blue-400/50",
                    "bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_34%,#06b6d4_68%,#14b8a6_100%)]"
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={askMilo}
                >
                  <SparklesIcon className="size-4" />
                  Ask Milo
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
