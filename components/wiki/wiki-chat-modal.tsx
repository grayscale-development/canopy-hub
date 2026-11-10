"use client"

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WikiChat } from "@/components/wiki/wiki-chat"

interface WikiChatModalContextValue {
  openWithPrompt: (prompt: string) => void
  close: () => void
}

const WikiChatModalContext =
  React.createContext<WikiChatModalContextValue | null>(null)
const openChatKey = "milo-chat-open"

export function useWikiChatModal() {
  const context = React.useContext(WikiChatModalContext)
  if (!context) {
    throw new Error(
      "useWikiChatModal must be used within WikiChatModalProvider."
    )
  }

  return context
}

export function WikiChatModalProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [queuedPrompt, setQueuedPrompt] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      try {
        if (active && sessionStorage.getItem(openChatKey) === "true")
          setIsOpen(true)
      } catch {
        // The chat still works without browser storage.
      }
    })
    return () => {
      active = false
    }
  }, [])

  const close = React.useCallback(() => {
    setIsOpen(false)
    setQueuedPrompt(null)
    try {
      sessionStorage.removeItem(openChatKey)
    } catch {
      /* Storage is optional. */
    }
  }, [])

  const openWithPrompt = React.useCallback((prompt: string) => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      return
    }

    setQueuedPrompt(trimmedPrompt)
    setIsOpen(true)
    try {
      sessionStorage.setItem(openChatKey, "true")
    } catch {
      /* Storage is optional. */
    }
  }, [])

  const value = React.useMemo(
    () => ({ openWithPrompt, close }),
    [close, openWithPrompt]
  )

  return (
    <WikiChatModalContext.Provider value={value}>
      {children}
      <Dialog
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            close()
          }
        }}
      >
        <DialogContent className="h-[min(78svh,44rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:w-[min(92vw,48rem)]">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Ask Milo</DialogTitle>
            <DialogDescription className="sr-only">
              Ask Milo a question and review the supporting resources.
            </DialogDescription>
          </DialogHeader>
          {isOpen ? (
            <WikiChat
              queuedPrompt={queuedPrompt}
              onQueuedPromptConsumed={() => setQueuedPrompt(null)}
              onNavigate={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </WikiChatModalContext.Provider>
  )
}
