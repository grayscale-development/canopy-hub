"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { WikiChat } from "@/components/wiki/wiki-chat"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface WikiChatDockContextValue {
  isOpen: boolean
  isAuthenticated: boolean
  toggle: () => void
  close: () => void
}

const MILO_CHAT_OPEN_STORAGE_KEY = "milo-chat-open"

const WikiChatDockContext =
  React.createContext<WikiChatDockContextValue | null>(null)

export function useWikiChatDock() {
  const context = React.useContext(WikiChatDockContext)
  if (!context) {
    throw new Error("useWikiChatDock must be used within WikiChatDockProvider.")
  }

  return context
}

export function WikiChatDockProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [hasMounted, setHasMounted] = React.useState(false)
  const [isAuthenticated, setIsAuthenticated] = React.useState(false)

  React.useEffect(() => {
    let isCurrent = true
    const supabase = createSupabaseBrowserClient()

    setHasMounted(true)

    async function loadAuthState() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isCurrent) {
        return
      }

      const nextIsAuthenticated = Boolean(user)
      setIsAuthenticated(nextIsAuthenticated)
      setIsOpen(
        nextIsAuthenticated &&
          window.localStorage.getItem(MILO_CHAT_OPEN_STORAGE_KEY) === "true"
      )
    }

    void loadAuthState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextIsAuthenticated = Boolean(session?.user)
      setIsAuthenticated(nextIsAuthenticated)
      setIsOpen(
        nextIsAuthenticated &&
          window.localStorage.getItem(MILO_CHAT_OPEN_STORAGE_KEY) === "true"
      )
    })

    return () => {
      isCurrent = false
      subscription.unsubscribe()
    }
  }, [])

  const setPersistedOpen = React.useCallback((nextOpen: boolean) => {
    setIsOpen(nextOpen)
    window.localStorage.setItem(
      MILO_CHAT_OPEN_STORAGE_KEY,
      nextOpen ? "true" : "false"
    )
  }, [])

  const value = React.useMemo<WikiChatDockContextValue>(
    () => ({
      isOpen,
      isAuthenticated,
      toggle: () => setPersistedOpen(!isOpen),
      close: () => setPersistedOpen(false),
    }),
    [isAuthenticated, isOpen, setPersistedOpen]
  )

  return (
    <WikiChatDockContext.Provider value={value}>
      <div className="flex min-h-svh w-full">
        <div className="min-w-0 flex-1">{children}</div>
        {hasMounted && isAuthenticated ? (
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 h-[min(80svh,44rem)] overflow-hidden shadow-2xl transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:shrink-0 lg:border-l lg:border-sidebar-border lg:shadow-none lg:transition-[width]",
              isOpen ? "translate-y-0 lg:w-[28rem]" : "translate-y-full lg:w-0"
            )}
          >
            <WikiChatDockPanel />
          </div>
        ) : null}
      </div>
    </WikiChatDockContext.Provider>
  )
}

export function WikiChatDockTrigger() {
  const { isAuthenticated, isOpen, toggle } = useWikiChatDock()

  if (!isAuthenticated) {
    return null
  }

  return (
    <Button
      type="button"
      variant="default"
      size="default"
      className={cn(
        "relative h-auto self-stretch overflow-hidden rounded-none border-0 border-l border-white/20 px-5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_28px_rgba(37,99,235,0.28)] transition-all duration-300 ease-out hover:brightness-110 focus-visible:ring-blue-400/50",
        "bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_34%,#06b6d4_68%,#14b8a6_100%)]",
        isOpen
          ? "pointer-events-none w-0 border-l-0 px-0 opacity-0"
          : "w-[8.75rem] opacity-100"
      )}
      aria-pressed={isOpen}
      onClick={toggle}
      tabIndex={isOpen ? -1 : undefined}
    >
      <SearchIcon className="size-4" />
      <span>Ask Milo</span>
    </Button>
  )
}

function WikiChatDockPanel() {
  const { isOpen, close } = useWikiChatDock()

  if (!isOpen) {
    return null
  }

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-t bg-sidebar text-sidebar-foreground lg:border-t-0">
      <div className="flex h-16 shrink-0 items-center gap-3 bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_34%,#06b6d4_68%,#14b8a6_100%)] px-4 text-white">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SearchIcon className="size-4 shrink-0" />
          <h2 className="truncate text-sm font-semibold">Ask Milo</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={close}
          aria-label="Close Milo chat"
          className="text-white hover:bg-white/15 hover:text-white"
        >
          <XIcon />
        </Button>
      </div>
      <WikiChat
        showTitle={false}
        className="h-full max-h-none min-h-0 flex-1 rounded-none border-0"
      />
    </aside>
  )
}
