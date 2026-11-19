"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Move } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  defaultMiloCorner,
  miloBottomOffset,
  miloCornerSchema,
  nearestMiloCorner,
  type MiloCorner,
} from "@/lib/milo-corners"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { WikiChat } from "@/components/wiki/wiki-chat"
import { MiloSearchOnly } from "@/components/wiki/milo-search-results"

interface WikiChatModalContextValue {
  openWithPrompt: (prompt: string) => void
  openWithDraft: (draft: string) => void
  close: () => void
  toggle: () => void
  registerPage: (page: MiloPage | null) => void
}

export interface MiloPage {
  pageId: string
  title: string
  pathname: string
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

export function MiloPageContext({
  pageId,
  title,
}: {
  pageId: string
  title: string
}) {
  const context = React.useContext(WikiChatModalContext)
  const pathname = usePathname()
  const registerPage = context?.registerPage
  React.useEffect(() => {
    if (!registerPage || !pathname) return
    registerPage({ pageId, title, pathname })
    return () => registerPage(null)
  }, [pageId, title, pathname, registerPage])
  return null
}

export function WikiChatModalProvider({
  children,
  signedIn,
  userId,
  canUseMilo,
  firstName,
}: {
  children: React.ReactNode
  signedIn: boolean
  userId: string | null
  canUseMilo: boolean
  firstName?: string
}) {
  const pathname = usePathname()
  const available =
    signedIn && pathname !== "/login" && !pathname?.startsWith("/login/")
  const [isOpen, setIsOpen] = React.useState(false)
  const [hasOpened, setHasOpened] = React.useState(false)
  const [showTip, setShowTip] = React.useState(false)
  // The tip counts as seen only once it is dismissed or Milo is opened.
  const dismissTip = React.useCallback(() => {
    setShowTip(false)
    try {
      localStorage.setItem(tipSeenKey, "true")
    } catch {
      // Storage is optional.
    }
  }, [])
  const [queuedPrompt, setQueuedPrompt] = React.useState<string | null>(null)
  const [page, setPage] = React.useState<MiloPage | null>(null)
  const [removedPageId, setRemovedPageId] = React.useState<string | null>(null)
  const lastPageId = React.useRef<string | null>(null)
  const lastPathname = React.useRef(pathname)
  React.useEffect(() => {
    if (lastPathname.current !== pathname) {
      lastPathname.current = pathname
      lastPageId.current = null
      setRemovedPageId(null)
    }
  }, [pathname])
  const registerPage = React.useCallback((next: MiloPage | null) => {
    if (next && next.pageId !== lastPageId.current) {
      lastPageId.current = next.pageId
      setRemovedPageId(null)
    }
    setPage(next)
  }, [])
  const [draftRequest, setDraftRequest] = React.useState<
    { value: string } | undefined
  >()
  const launcherRef = React.useRef<HTMLButtonElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const interactedRef = React.useRef(false)
  const [corner, setCorner] = React.useState<MiloCorner>(defaultMiloCorner)
  const [cachedForUser, setCachedForUser] = React.useState<string | null>(null)
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 })
  const [launcherWidth, setLauncherWidth] = React.useState(0)
  const [obstruction, setObstruction] = React.useState<{
    left: number
    top: number
  } | null>(null)
  const [dragOffset, setDragOffset] = React.useState<{
    x: number
    y: number
  } | null>(null)
  const panelRef = React.useRef<HTMLElement>(null)
  const launcherContainerRef = React.useRef<HTMLDivElement>(null)
  const preferenceVersion = React.useRef(0)
  const writeQueue = React.useRef<Promise<void>>(Promise.resolve())
  const activeCacheKey = React.useRef<string | null>(null)
  const drag = React.useRef<{
    pointerId: number
    x: number
    y: number
    moved: boolean
  } | null>(null)
  const suppressClick = React.useRef(false)
  const snapFrom = React.useRef<{
    element: HTMLElement
    left: number
    top: number
  } | null>(null)
  const cacheKey = userId ? `milo-corner:${userId}` : null

  React.useLayoutEffect(() => {
    activeCacheKey.current = available ? cacheKey : null
    if (!available || !cacheKey) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const cached = miloCornerSchema.safeParse(
          localStorage.getItem(cacheKey)
        )
        setCorner(cached.success ? cached.data : defaultMiloCorner)
      } catch {
        setCorner(defaultMiloCorner)
      }
      setCachedForUser(cacheKey)
    })
    return () => {
      active = false
    }
  }, [available, cacheKey])

  React.useEffect(() => {
    if (!available || !cacheKey) return
    const controller = new AbortController()
    const version = preferenceVersion.current
    void fetch("/api/milo/preferences", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        const parsed = miloCornerSchema.safeParse(data?.corner)
        if (
          !controller.signal.aborted &&
          version === preferenceVersion.current &&
          parsed.success
        ) {
          setCorner(parsed.data)
          try {
            localStorage.setItem(cacheKey, parsed.data)
          } catch {
            /* Storage is optional. */
          }
        }
      })
      .catch(() => {
        /* Keep the cached corner if the request fails. */
      })
    return () => controller.abort()
  }, [available, cacheKey])

  const moveToCorner = React.useCallback(
    (next: MiloCorner) => {
      preferenceVersion.current++
      setCorner(next)
      try {
        if (cacheKey) localStorage.setItem(cacheKey, next)
      } catch {
        /* Storage is optional. */
      }
      // Serialize writes so a slow earlier request cannot overwrite the latest move.
      writeQueue.current = writeQueue.current
        .catch(() => {})
        .then(async () => {
          if (!cacheKey || activeCacheKey.current !== cacheKey) return
          await fetch("/api/milo/preferences", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ corner: next }),
          })
        })
        .catch(() => {
          /* A failed save never blocks the panel. */
        })
    },
    [cacheKey]
  )

  React.useEffect(() => {
    if (!available) return
    let observed: Element | null = null
    const measure = () => {
      setViewport((old) =>
        old.width === window.innerWidth && old.height === window.innerHeight
          ? old
          : { width: window.innerWidth, height: window.innerHeight }
      )
      setLauncherWidth(launcherRef.current?.getBoundingClientRect().width ?? 0)
      const bar = document.querySelector('[data-milo-avoid="bottom-right"]')
      if (bar !== observed) {
        if (observed) resizeObserver.unobserve(observed)
        observed = bar
        if (bar) resizeObserver.observe(bar)
      }
      const rect = bar?.getBoundingClientRect()
      const next =
        rect && rect.width > 0 && rect.height > 0
          ? { left: rect.left, top: rect.top }
          : null
      setObstruction((old) =>
        old?.left === next?.left && old?.top === next?.top ? old : next
      )
    }
    const resizeObserver = new ResizeObserver(measure)
    const mutationObserver = new MutationObserver(measure)
    mutationObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    const frame = requestAnimationFrame(measure)
    return () => {
      cancelAnimationFrame(frame)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [available, isOpen, corner])

  React.useLayoutEffect(() => {
    const from = snapFrom.current
    if (!from || dragOffset) return
    snapFrom.current = null
    const rect = from.element.getBoundingClientRect()
    if (
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      typeof from.element.animate === "function"
    ) {
      from.element.animate(
        [
          {
            transform: `translate(${from.left - rect.left}px, ${from.top - rect.top}px)`,
          },
          { transform: "translate(0, 0)" },
        ],
        { duration: 180, easing: "ease-out" }
      )
    }
  }, [corner, dragOffset])

  const startDrag = (
    event: React.PointerEvent<HTMLElement>,
    header: boolean
  ) => {
    if (window.innerWidth < 640 || !event.isPrimary || event.button !== 0)
      return
    // Portalled children (the corner menu) bubble React events through here.
    if (!event.currentTarget.contains(event.target as Node)) return
    if (
      header &&
      (event.target as HTMLElement).closest(
        "button, a, input, textarea, [role=button]"
      )
    )
      return
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const x = event.clientX - current.x
    const y = event.clientY - current.y
    if (!current.moved && Math.hypot(x, y) < 6) return
    current.moved = true
    setDragOffset({ x, y })
  }
  const endDrag = (
    event: React.PointerEvent<HTMLElement>,
    cancelled = false
  ) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (current.moved && !cancelled) {
      const element = isOpen ? panelRef.current : launcherContainerRef.current
      if (element) {
        const rect = element.getBoundingClientRect()
        snapFrom.current = { element, left: rect.left, top: rect.top }
      }
      suppressClick.current = !isOpen
      if (!isOpen)
        window.setTimeout(() => {
          suppressClick.current = false
        }, 0)
      moveToCorner(
        nearestMiloCorner(
          event.clientX,
          event.clientY,
          window.innerWidth,
          window.innerHeight
        )
      )
    }
    setDragOffset(null)
  }

  const isTop = corner.startsWith("top")
  const isLeft = corner.endsWith("left")
  const desktop = viewport.width >= 640
  const baseBottom = desktop ? 24 : 16
  const panelWidth = Math.min(400, viewport.width - 32)
  const targetWidth = isOpen && desktop ? panelWidth : launcherWidth
  const overlapsBar =
    !isLeft ||
    (obstruction !== null && baseBottom + targetWidth > obstruction.left)
  const bottomOffset = miloBottomOffset(
    baseBottom,
    viewport.height,
    obstruction?.top ?? null,
    overlapsBar
  )
  // On phones the panel is full screen, but it stops above the editor's Save bar.
  const phoneAboveBar = isOpen && !desktop && obstruction !== null
  const positionStyle = {
    "--milo-bottom": `${bottomOffset}px`,
    ...(phoneAboveBar && obstruction
      ? {
          bottom: miloBottomOffset(0, viewport.height, obstruction.top, true),
          height: "auto",
        }
      : {}),
    visibility: cacheKey && cachedForUser === cacheKey ? undefined : "hidden",
    transform: dragOffset
      ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
      : undefined,
  } as React.CSSProperties

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
        if (!localStorage.getItem(tipSeenKey)) setShowTip(true)
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
    if (open) {
      setHasOpened(true)
      dismissTip()
    }
    setIsOpen(open)
    try {
      localStorage.setItem(openChatKey, String(open))
    } catch {
      /* Storage is optional. */
    }
  }, [dismissTip])

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
      setDraftRequest({ value: canUseMilo ? "" : trimmedPrompt })
      setQueuedPrompt(canUseMilo ? trimmedPrompt : null)
      setOpen(true)
    },
    [canUseMilo, setOpen]
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
    if (available && isOpen && cachedForUser === cacheKey) {
      const composer = document.querySelector<HTMLTextAreaElement>(
        `#${panelId} textarea:not(:disabled)`
      )
      ;(composer ?? closeRef.current)?.focus()
    }
  }, [available, isOpen, cachedForUser, cacheKey])

  const value = React.useMemo(
    () => ({ openWithPrompt, openWithDraft, close, toggle, registerPage }),
    [close, openWithDraft, openWithPrompt, toggle, registerPage]
  )

  return (
    <WikiChatModalContext.Provider value={value}>
      {children}
      {available ? (
        <>
          <div
            ref={launcherContainerRef}
            className={`fixed z-50 ${isLeft ? "left-4 sm:left-6" : "right-4 sm:right-6"} ${isTop ? "top-20" : "bottom-[var(--milo-bottom)]"}`}
            style={positionStyle}
            hidden={isOpen}
          >
            {showTip ? (
              <div
                className={`absolute flex w-64 items-start gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md ${isLeft ? "left-0" : "right-0"} ${isTop ? "top-full mt-3" : "bottom-full mb-3"}`}
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
                  onClick={dismissTip}
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
                  onClick={(event) => {
                    if (suppressClick.current) {
                      suppressClick.current = false
                      event.preventDefault()
                      return
                    }
                    toggle()
                  }}
                  onPointerDown={(event) => startDrag(event, false)}
                  onPointerMove={moveDrag}
                  onPointerUp={(event) => endDrag(event)}
                  onPointerCancel={(event) => endDrag(event, true)}
                  onLostPointerCapture={(event) => endDrag(event, true)}
                  aria-label="Ask Milo"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="size-12 rounded-full shadow-lg sm:h-10 sm:w-auto sm:touch-none sm:px-4"
                >
                  <span aria-hidden="true">✦</span>
                  <span className="hidden sm:inline">Ask Milo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side={isTop ? "bottom" : "top"} sideOffset={6}>
                ⌘J / Ctrl+J
              </TooltipContent>
            </Tooltip>
          </div>
          <section
            id={panelId}
            ref={panelRef}
            style={positionStyle}
            role="dialog"
            aria-labelledby="milo-panel-title"
            hidden={!isOpen}
            className={`fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden border bg-background [padding-top:env(safe-area-inset-top)] [padding-right:env(safe-area-inset-right)] [padding-bottom:env(safe-area-inset-bottom)] [padding-left:env(safe-area-inset-left)] text-foreground shadow-xl sm:inset-auto sm:h-[min(640px,calc(100dvh-80px-var(--milo-bottom)))] sm:w-[min(400px,calc(100vw-2rem))] sm:rounded-xl sm:p-0 ${isLeft ? "sm:left-6" : "sm:right-6"} ${isTop ? "sm:top-20" : "sm:bottom-[var(--milo-bottom)]"}`}
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:cursor-grab sm:touch-none sm:active:cursor-grabbing"
              onPointerDown={(event) => startDrag(event, true)}
              onPointerMove={moveDrag}
              onPointerUp={(event) => endDrag(event)}
              onPointerCancel={(event) => endDrag(event, true)}
              onLostPointerCapture={(event) => endDrag(event, true)}
            >
              <h2 id="milo-panel-title" className="font-semibold">
                {canUseMilo ? "Milo" : "Search"}
              </h2>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Move to corner"
                      className="hidden sm:inline-flex"
                    >
                      <Move aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      value={corner}
                      onValueChange={(value) => {
                        const parsed = miloCornerSchema.safeParse(value)
                        if (parsed.success) moveToCorner(parsed.data)
                      }}
                    >
                      <DropdownMenuRadioItem value="top-left">
                        Top left
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="top-right">
                        Top right
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="bottom-left">
                        Bottom left
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="bottom-right">
                        Bottom right
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
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
            </div>
            {hasOpened &&
              (canUseMilo ? (
                <WikiChat
                  firstName={firstName}
                  pageContext={
                    page?.pathname === pathname && page.pageId !== removedPageId
                      ? page
                      : null
                  }
                  onRemovePage={() => setRemovedPageId(page?.pageId ?? null)}
                  queuedPrompt={queuedPrompt}
                  draftRequest={draftRequest}
                  autoFocus={isOpen}
                  onQueuedPromptConsumed={() => setQueuedPrompt(null)}
                />
              ) : (
                <MiloSearchOnly
                  draftRequest={draftRequest}
                  autoFocus={isOpen}
                />
              ))}
          </section>
        </>
      ) : null}
    </WikiChatModalContext.Provider>
  )
}
