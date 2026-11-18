"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export interface MiloSearchResult {
  id: string
  title: string
  url: string
  type: string
  typeLabel?: string
  snippet: string
}

export function searchableQuery(value: string) {
  const query = value.trim()
  return query.length >= 2 && value.length <= 200 && !/[\r\n]/.test(value)
    ? query
    : ""
}

export async function fetchMiloResults(query: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/wiki/search?q=${encodeURIComponent(query)}`,
    { signal }
  )
  if (!response.ok) throw new Error("Search failed")
  const data = await response.json()
  if (!Array.isArray(data.results)) return []
  // Only navigate to local, absolute paths returned by the search API.
  const results = (data.results as MiloSearchResult[]).filter(
    (result) =>
      typeof result.url === "string" &&
      /^\/(?![\/\\])/.test(result.url) &&
      typeof result.id === "string" &&
      typeof result.title === "string" &&
      typeof result.type === "string"
  )
  return results
    .sort(
      (a, b) =>
        Number(!["wiki_tag", "wiki_page"].includes(a.type)) -
        Number(!["wiki_tag", "wiki_page"].includes(b.type))
    )
    .slice(0, 5)
}

export function useMiloSearch(input: string, disabled = false) {
  const query = disabled ? "" : searchableQuery(input)
  const [found, setFound] = React.useState<{
    query: string
    results: MiloSearchResult[]
    error?: boolean
  } | null>(null)
  const [selected, setSelected] = React.useState<{
    query: string
    index: number
  } | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const router = useRouter()
  const listId = React.useId()
  const results = found?.query === query && query ? found.results : []
  const activeIndex =
    selected?.query === query && selected.index < results.length
      ? selected.index
      : -1

  React.useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchMiloResults(query, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) setFound({ query, results })
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setFound({ query, results: [], error: true })
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, attempt])

  function navigate(result: MiloSearchResult) {
    router.push(result.url)
    setFound(null)
    setSelected(null)
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      results.length
    ) {
      event.preventDefault()
      const index =
        event.key === "ArrowDown"
          ? (activeIndex + 1) % results.length
          : activeIndex < 0
            ? results.length - 1
            : (activeIndex - 1 + results.length) % results.length
      setSelected({ query, index })
      document
        .getElementById(`${listId}-${index}`)
        ?.scrollIntoView?.({ block: "nearest" })
      return true
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      activeIndex >= 0
    ) {
      event.preventDefault()
      navigate(results[activeIndex])
      return true
    }
    return false
  }
  return {
    query,
    results,
    listId,
    activeIndex,
    onKeyDown,
    navigate,
    completed: found?.query === query && Boolean(query),
    error: found?.query === query && Boolean(found.error),
    clearSelection: () => setSelected(null),
    retry: () => setAttempt((value) => value + 1),
    inputProps: {
      "aria-autocomplete": "list" as const,
      "aria-controls": results.length ? listId : undefined,
      "aria-activedescendant":
        activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined,
    },
  }
}

export function MiloSearchResults({
  search,
  onNavigate,
}: {
  search: ReturnType<typeof useMiloSearch>
  onNavigate?: () => void
}) {
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {search.completed
          ? search.error
            ? "Search unavailable. Try again."
            : `${search.results.length} search results available.`
          : ""}
      </span>
      {search.completed && search.results.length === 0 && (
        <p className="mb-2 px-1 text-sm text-muted-foreground">
          {search.error
            ? "Search unavailable. Try again."
            : "No results found."}
        </p>
      )}
      {search.results.length > 0 && (
        <div className="mb-2 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground">
          <div id={search.listId} role="listbox" aria-label="Search results">
            {search.results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}`}
                id={`${search.listId}-${index}`}
                type="button"
                role="option"
                aria-selected={search.activeIndex === index}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  search.navigate(result)
                  onNavigate?.()
                }}
                className="flex w-full flex-col gap-0.5 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none aria-selected:bg-accent"
              >
                <span className="line-clamp-1 font-medium">{result.title}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {result.typeLabel || result.type.replaceAll("_", " ")}
                  {result.snippet ? ` · ${result.snippet}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export function MiloSearchOnly({
  draftRequest,
  autoFocus,
}: {
  draftRequest?: { value: string }
  autoFocus?: boolean
}) {
  const [input, setInput] = React.useState(draftRequest?.value ?? "")
  const composer = React.useRef<HTMLTextAreaElement>(null)
  const search = useMiloSearch(input)
  const [appliedDraft, setAppliedDraft] = React.useState(draftRequest)
  if (draftRequest !== appliedDraft) {
    setAppliedDraft(draftRequest)
    if (draftRequest) setInput(draftRequest.value)
  }
  React.useEffect(() => {
    if (autoFocus) composer.current?.focus()
  }, [autoFocus])
  function submit() {
    if (search.query) search.retry()
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex-1 px-6 py-5 text-sm text-muted-foreground">
        Find people, branches, newsletters and documents.
      </p>
      <form
        className="border-t p-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <MiloSearchResults search={search} onNavigate={() => setInput("")} />
        <div className="flex items-end gap-2">
          <textarea
            ref={composer}
            value={input}
            onChange={(event) => {
              search.clearSelection()
              setInput(event.currentTarget.value)
            }}
            onKeyDown={(event) => {
              if (search.onKeyDown(event)) {
                if (event.key === "Enter") setInput("")
                return
              }
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                submit()
              }
            }}
            {...search.inputProps}
            rows={Math.min(8, Math.max(1, input.split("\n").length))}
            placeholder="Search people, branches and documents"
            aria-label="Search people, branches and documents"
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!search.query}
            aria-label="Search"
          >
            <SearchIcon />
          </Button>
        </div>
      </form>
    </div>
  )
}
