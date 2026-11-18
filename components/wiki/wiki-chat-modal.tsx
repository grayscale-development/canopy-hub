"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { WikiChat } from "@/components/wiki/wiki-chat"

interface WikiChatModalContextValue {
  openWithPrompt: (prompt: string) => void
  openWithDraft: (draft: string) => void
  close: () => void
  toggle: () => void
}

const WikiChatModalContext =
  React.createContext<WikiChatModalContextValue | null>(null)
const openChatKey = "milo-chat-open"
const tipSeenKey = "milo-moved-tip-seen"
const panelId = "milo-panel"

export function useWikiChatModal() {
  const context = React.useContext(WikiChatModalContext)
  if (!context)
    throw new Error(
      "useWikiChatModal must be used within WikiChatModalProvider."
    )
  return context
}

export function WikiChatModalProvider({
  children,
  signedIn,
  canUseMilo,
}: {
  children: React.ReactNode
  signedIn: boolean
  canUseMilo: boolean
}) {
  const pathname = usePathname()
  const available =
    signedIn && pathname !== "/login" && !pathname?.startsWith("/login/")
  const [isOpen, setIsOpen] = React.useState(false)
  const [hasOpened, setHasOpened] = React.useState(false)
  const [showTip, setShowTip] = React.useState(false)
  const [queuedPrompt, setQueuedPrompt] = React.useState<string | null>(null)
  const [draftRequest, setDraftRequest] = React.useState<
    { value: string } | undefined
  >()
  const launcherRef = React.useRef<HTMLButtonElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const interactedRef = React.useRef(false)

  React.useEffect(() => {
    if (!available) return
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      try {
        if (
          !interactedRef.current &&
          localStorage.getItem(openChatKey) === "true"
        ) {
          setHasOpened(true)
          setIsOpen(true)
        }
      } catch {
        // Storage is optional.
      }
    })
    return () => {
      active = false
    }
  }, [available])

  React.useEffect(() => {
    if (!available || isOpen) return
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      try {
        if (
          !interactedRef.current &&
          localStorage.getItem(openChatKey) === "true"
        )
          return
        if (!localStorage.getItem(tipSeenKey)) {
          setShowTip(true)
          localStorage.setItem(tipSeenKey, "true")
        }
      } catch {
        // Storage is optional.
      }
    })
    return () => {
      active = false
    }
  }, [available, isOpen])

  const setOpen = React.useCallback((open: boolean) => {
    interactedRef.current = true
    if (open) setHasOpened(true)
    setIsOpen(open)
    try {
      localStorage.setItem(openChatKey, String(open))
    } catch {
      /* Storage is optional. */
    }
  }, [])

  const close = React.useCallback(() => {
    setOpen(false)
    setQueuedPrompt(null)
    // The launcher is revealed in the next render.
    requestAnimationFrame(() => launcherRef.current?.focus())
  }, [setOpen])

  const openWithPrompt = React.useCallback(
    (prompt: string) => {
      const trimmedPrompt = prompt.trim()
      if (!trimmedPrompt) return
      setDraftRequest({ value: "" })
      setQueuedPrompt(trimmedPrompt)
      setOpen(true)
    },
    [setOpen]
  )

  const openWithDraft = React.useCallback(
    (value: string) => {
      setQueuedPrompt(null)
      setDraftRequest({ value })
      setOpen(true)
    },
    [setOpen]
  )

  const toggle = React.useCallback(() => {
    if (isOpen) close()
    else setOpen(true)
  }, [close, isOpen, setOpen])

  React.useEffect(() => {
    if (!available) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "j"
      ) {
        event.preventDefault()
        toggle()
      } else if (event.key === "Escape" && isOpen) {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [available, close, isOpen, toggle])

  React.useEffect(() => {
    if (available && isOpen) {
      const composer = document.querySelector<HTMLTextAreaElement>(
        `#${panelId} textarea[aria-label="Ask a follow-up"]:not(:disabled)`
      )
      ;(composer ?? closeRef.current)?.focus()
    }
  }, [available, isOpen])

  const value = React.useMemo(
    () => ({ openWithPrompt, openWithDraft, close, toggle }),
    [close, openWithDraft, openWithPrompt, toggle]
  )

  return (
    <WikiChatModalContext.Provider value={value}>
      {children}
      {available ? (
        <>
          <div
            className="fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6"
            hidden={isOpen}
          >
            {showTip ? (
              <div
                className="absolute right-0 bottom-full mb-3 flex w-64 items-start gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md"
                role="status"
              >
                <p className="flex-1">
                  Milo moved here. Press ⌘J / Ctrl+J any time.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Dismiss Milo tip"
                  onClick={() => setShowTip(false)}
                >
                  ×
                </Button>
              </div>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={launcherRef}
                  type="button"
                  onClick={toggle}
                  aria-label="Ask Milo"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="size-12 rounded-full shadow-lg sm:h-10 sm:w-auto sm:px-4"
                >
                  <span aria-hidden="true">✦</span>
                  <span className="hidden sm:inline">Ask Milo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                ⌘J / Ctrl+J
              </TooltipContent>
            </Tooltip>
          </div>
          <section
            id={panelId}
            role="dialog"
            aria-labelledby="milo-panel-title"
            hidden={!isOpen}
            className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden border bg-background [padding-top:env(safe-area-inset-top)] [padding-right:env(safe-area-inset-right)] [padding-bottom:env(safe-area-inset-bottom)] [padding-left:env(safe-area-inset-left)] text-foreground shadow-xl sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(640px,calc(100dvh-2rem))] sm:w-[min(400px,calc(100vw-2rem))] sm:rounded-xl sm:p-0"
          >
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <h2 id="milo-panel-title" className="font-semibold">
                Milo
              </h2>
              <Button
                ref={closeRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={close}
                className="text-xl"
              >
                ×
              </Button>
            </div>
            {hasOpened &&
              (canUseMilo ? (
                <WikiChat
                  queuedPrompt={queuedPrompt}
                  draftRequest={draftRequest}
                  autoFocus={isOpen}
                  onQueuedPromptConsumed={() => setQueuedPrompt(null)}
                />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  Search coming soon
                </p>
              ))}
          </section>
        </>
      ) : null}
    </WikiChatModalContext.Provider>
  )
}
