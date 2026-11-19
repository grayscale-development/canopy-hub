"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { History, SquarePen } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  miloPositionSchema,
  normalizeMilo,
  placeMilo,
  type MiloPoint,
  type MiloPosition,
  type MiloRect,
  type MiloSize,
} from "@/lib/milo-position"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { WikiChat, type WikiChatHandle } from "@/components/wiki/wiki-chat"

interface WikiChatModalContextValue {
  available: boolean
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
const finePointerQuery = "(hover: hover) and (pointer: fine)"

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
  const [embedded, setEmbedded] = React.useState(false)
  React.useEffect(() => {
    // Fallback for browsers that don't send Sec-Fetch-Dest.
    if (window.self !== window.top) queueMicrotask(() => setEmbedded(true))
  }, [])
  const available =
    canUseMilo &&
    !embedded &&
    signedIn &&
    pathname !== "/login" &&
    !pathname?.startsWith("/login/")
  const [isOpen, setIsOpen] = React.useState(false)
  const [hasOpened, setHasOpened] = React.useState(false)
  const [showTip, setShowTip] = React.useState(false)
  const [finePointer, setFinePointer] = React.useState(false)
  const [shortcut, setShortcut] = React.useState("Ctrl+J")
  const [tooltipOpen, setTooltipOpen] = React.useState(false)
  const keyboardInput = React.useRef(false)
  const keyboardFocus = React.useRef(false)
  const hoveringLauncher = React.useRef(false)
  const restoringFocus = React.useRef(false)
  React.useEffect(() => {
    const media = window.matchMedia(finePointerQuery)
    const update = () => setFinePointer(media.matches)
    let active = true
    queueMicrotask(() => {
      if (!active) return
      update()
      setShortcut(
        /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘J" : "Ctrl+J"
      )
    })
    media.addEventListener("change", update)
    const onKey = () => {
      keyboardInput.current = true
    }
    const onPointer = () => {
      keyboardInput.current = false
    }
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("pointerdown", onPointer, true)
    return () => {
      active = false
      media.removeEventListener("change", update)
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("pointerdown", onPointer, true)
    }
  }, [])
  // The tip counts as seen only once it is dismissed or Milo is opened.
  const dismissTip = React.useCallback(() => {
    setShowTip(false)
    if (!window.matchMedia(finePointerQuery).matches) return
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
  const chatRef = React.useRef<WikiChatHandle>(null)
  const interactedRef = React.useRef(false)
  const [position, setPosition] = React.useState<MiloPosition | null>(null)
  const [cachedForUser, setCachedForUser] = React.useState<string | null>(null)
  const [viewport, setViewport] = React.useState<MiloSize>({
    width: 0,
    height: 0,
  })
  const [size, setSize] = React.useState<MiloSize>({ width: 0, height: 0 })
  const [obstruction, setObstruction] = React.useState<MiloRect | null>(null)
  const [dragPoint, setDragPoint] = React.useState<MiloPoint | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const panelRef = React.useRef<HTMLElement>(null)
  const launcherContainerRef = React.useRef<HTMLDivElement>(null)
  const preferenceVersion = React.useRef(0)
  const writeQueue = React.useRef<Promise<void>>(Promise.resolve())
  const activeCacheKey = React.useRef<string | null>(null)
  const drag = React.useRef<{
    pointerId: number
    x: number
    y: number
    origin: MiloPoint
    point: MiloPoint
    moved: boolean
    userSelect: string
  } | null>(null)
  const suppressClick = React.useRef(false)
  const cacheKey = userId ? `milo-position:${userId}` : null

  React.useLayoutEffect(() => {
    activeCacheKey.current = available ? cacheKey : null
    if (!available || !cacheKey) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const raw = localStorage.getItem(cacheKey)
        const cached = miloPositionSchema
          .nullable()
          .safeParse(JSON.parse(raw ?? "null"))
        setPosition(cached.success ? cached.data : null)
        if (raw !== null && cached.success) setCachedForUser(cacheKey)
      } catch {
        setPosition(null)
      }
    })
    return () => {
      active = false
    }
  }, [available, cacheKey])

  React.useEffect(() => {
    if (!available || !cacheKey) return
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => {
      controller.abort()
      if (active) setCachedForUser(cacheKey)
    }, 5000)
    const version = preferenceVersion.current
    void fetch("/api/milo/preferences", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        const parsed = miloPositionSchema.nullable().safeParse(data?.position)
        if (
          !controller.signal.aborted &&
          version === preferenceVersion.current &&
          parsed.success
        ) {
          setPosition(parsed.data)
          try {
            localStorage.setItem(cacheKey, JSON.stringify(parsed.data))
          } catch {
            /* Storage is optional. */
          }
        }
      })
      .catch(() => {
        /* Keep the cached position if the request fails. */
      })
      .finally(() => {
        clearTimeout(timeout)
        if (active) setCachedForUser(cacheKey)
      })
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [available, cacheKey])

  const savePosition = React.useCallback(
    (next: MiloPosition) => {
      preferenceVersion.current++
      setPosition(next)
      try {
        if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(next))
      } catch {
        /* Storage is optional. */
      }
      writeQueue.current = writeQueue.current
        .catch(() => {})
        .then(async () => {
          if (!cacheKey || activeCacheKey.current !== cacheKey) return
          await fetch("/api/milo/preferences", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ position: next }),
          })
        })
        .catch(() => {
          /* A failed save never blocks the panel. */
        })
    },
    [cacheKey]
  )

  React.useLayoutEffect(() => {
    if (!available) return
    let observed: Element | null = null
    const observer = new ResizeObserver(measure)
    function measure() {
      const width = window.innerWidth
      const height = window.innerHeight
      setViewport((old) =>
        old.width === width && old.height === height ? old : { width, height }
      )
      const element =
        isOpen && width >= 640 ? panelRef.current : launcherContainerRef.current
      const rect = element?.getBoundingClientRect()
      if (rect && rect.width && rect.height) {
        setSize((old) =>
          old.width === rect.width && old.height === rect.height
            ? old
            : { width: rect.width, height: rect.height }
        )
      }
      const bar = document.querySelector('[data-milo-avoid="bottom-right"]')
      if (bar !== observed) {
        if (observed) observer.unobserve(observed)
        observed = bar
        if (bar) observer.observe(bar)
      }
      const b = bar?.getBoundingClientRect()
      const next =
        b && b.width > 0 && b.height > 0
          ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
          : null
      setObstruction((old) =>
        old?.left === next?.left &&
        old?.top === next?.top &&
        old?.right === next?.right &&
        old?.bottom === next?.bottom
          ? old
          : next
      )
    }
    if (panelRef.current) observer.observe(panelRef.current)
    if (launcherContainerRef.current)
      observer.observe(launcherContainerRef.current)
    const mutations = new MutationObserver(measure)
    mutations.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", measure)
    window.addEventListener("orientationchange", measure)
    measure()
    return () => {
      mutations.disconnect()
      observer.disconnect()
      window.removeEventListener("resize", measure)
      window.removeEventListener("orientationchange", measure)
    }
  }, [available, isOpen])

  React.useEffect(
    () => () => {
      if (drag.current?.moved)
        document.body.style.userSelect = drag.current.userSelect
    },
    []
  )

  const desktop = viewport.width >= 640
  const actualSize =
    size.width && size.height
      ? size
      : isOpen && desktop
        ? {
            width: Math.min(400, viewport.width - 20),
            height: Math.min(640, viewport.height - 20),
          }
        : { width: desktop ? 100 : 48, height: desktop ? 40 : 48 }
  const placed = placeMilo(
    position,
    viewport,
    actualSize,
    obstruction,
    dragPoint ?? undefined
  )
  const isLeft = placed.x + actualSize.width / 2 < viewport.width / 2
  const isTop = placed.y + actualSize.height / 2 < viewport.height / 2

  const startDrag = (
    event: React.PointerEvent<HTMLElement>,
    header: boolean
  ) => {
    if ((header && !desktop) || !event.isPrimary || event.button !== 0) return
    if (!event.currentTarget.contains(event.target as Node)) return
    if (
      header &&
      (event.target as HTMLElement).closest(
        "button, a, input, textarea, [role=button]"
      )
    )
      return
    event.preventDefault()
    const element = header ? panelRef.current : launcherContainerRef.current
    const rect = element?.getBoundingClientRect()
    const origin = rect ? { x: rect.left, y: rect.top } : placed
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin,
      point: origin,
      moved: false,
      userSelect: document.body.style.userSelect,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.moved && Math.hypot(dx, dy) < 4) return
    if (!current.moved) {
      current.moved = true
      document.body.style.userSelect = "none"
      setDragging(true)
    }
    current.point = placeMilo(position, viewport, actualSize, obstruction, {
      x: current.origin.x + dx,
      y: current.origin.y + dy,
    })
    setDragPoint(current.point)
  }
  const endDrag = (
    event: React.PointerEvent<HTMLElement>,
    cancelled = false
  ) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    if (current.moved) {
      document.body.style.userSelect = current.userSelect
      setDragging(false)
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      }, 0)
      if (!cancelled)
        savePosition(normalizeMilo(current.point, viewport, actualSize))
    }
    setDragPoint(null)
  }
  const moveByKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      !desktop ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return
    const delta: Record<string, MiloPoint> = {
      ArrowLeft: { x: -24, y: 0 },
      ArrowRight: { x: 24, y: 0 },
      ArrowUp: { x: 0, y: -24 },
      ArrowDown: { x: 0, y: 24 },
    }
    const step = delta[event.key]
    if (!step) return
    event.preventDefault()
    const next = placeMilo(position, viewport, actualSize, obstruction, {
      x: placed.x + step.x,
      y: placed.y + step.y,
    })
    savePosition(normalizeMilo(next, viewport, actualSize))
  }
  const ready = cacheKey && cachedForUser === cacheKey && viewport.width > 0
  const positionStyle: React.CSSProperties = {
    left: placed.x,
    top: placed.y,
    visibility: ready ? undefined : "hidden",
  }
  const panelStyle: React.CSSProperties = desktop
    ? {
        ...positionStyle,
        ...(obstruction
          ? { maxHeight: Math.max(0, obstruction.top - 20) }
          : {}),
      }
    : {
        visibility: ready ? undefined : "hidden",
        ...(obstruction
          ? {
              bottom: Math.max(0, viewport.height - obstruction.top + 10),
              height: "auto",
            }
          : {}),
      }

  React.useLayoutEffect(() => {
    if (!available) return
    const body = document.body
    body.dataset.miloLauncher = "bottom"
    body.style.setProperty("--milo-launcher-clearance", "72px")
    return () => {
      delete body.dataset.miloLauncher
      body.style.removeProperty("--milo-launcher-clearance")
    }
  }, [available])

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
    if (!available || isOpen || !finePointer) return
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
  }, [available, isOpen, finePointer])

  const setOpen = React.useCallback(
    (open: boolean) => {
      if (!available) return
      interactedRef.current = true
      if (open) {
        setTooltipOpen(false)
        hoveringLauncher.current = false
        keyboardFocus.current = false
        setHasOpened(true)
        dismissTip()
      }
      setIsOpen(open)
      try {
        localStorage.setItem(openChatKey, String(open))
      } catch {
        /* Storage is optional. */
      }
    },
    [available, dismissTip]
  )

  const close = React.useCallback(() => {
    setOpen(false)
    setQueuedPrompt(null)
    setTooltipOpen(false)
    // The launcher is revealed in the next render.
    requestAnimationFrame(() => {
      restoringFocus.current = true
      launcherRef.current?.focus()
      restoringFocus.current = false
    })
  }, [setOpen])

  const openWithPrompt = React.useCallback(
    (prompt: string) => {
      if (!available) return
      const trimmedPrompt = prompt.trim()
      if (!trimmedPrompt) return
      setDraftRequest({ value: "" })
      setQueuedPrompt(trimmedPrompt)
      setOpen(true)
    },
    [available, setOpen]
  )

  const openWithDraft = React.useCallback(
    (value: string) => {
      if (!available) return
      setQueuedPrompt(null)
      setDraftRequest({ value })
      setOpen(true)
    },
    [available, setOpen]
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
    () => ({
      available,
      openWithPrompt,
      openWithDraft,
      close,
      toggle,
      registerPage,
    }),
    [available, close, openWithDraft, openWithPrompt, toggle, registerPage]
  )

  return (
    <WikiChatModalContext.Provider value={value}>
      {children}
      {available ? (
        <>
          <div
            ref={launcherContainerRef}
            className="fixed z-50"
            style={positionStyle}
            hidden={isOpen}
          >
            {showTip && finePointer ? (
              <div
                className={`absolute top-1/2 flex w-max max-w-[min(280px,calc(100vw-6rem))] -translate-y-1/2 items-center gap-1 rounded-lg border bg-popover py-0 pr-1 pl-2 text-xs text-popover-foreground shadow-md ${isLeft ? "left-full ml-2" : "right-full mr-2"}`}
                role="status"
              >
                <p className="min-w-0 truncate">
                  Milo lives here now · {shortcut}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Dismiss Milo tip"
                  onClick={dismissTip}
                >
                  ×
                </Button>
              </div>
            ) : null}
            <Tooltip
              open={tooltipOpen}
              onOpenChange={(open) =>
                setTooltipOpen(
                  open && (hoveringLauncher.current || keyboardFocus.current)
                )
              }
            >
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
                  onPointerMove={(event) => {
                    hoveringLauncher.current = event.pointerType === "mouse"
                    moveDrag(event)
                  }}
                  onPointerLeave={() => {
                    hoveringLauncher.current = false
                    if (!keyboardFocus.current) setTooltipOpen(false)
                  }}
                  onFocus={(event) => {
                    keyboardFocus.current =
                      !restoringFocus.current &&
                      keyboardInput.current &&
                      event.currentTarget.matches(":focus-visible")
                  }}
                  onBlur={() => {
                    keyboardFocus.current = false
                    if (!hoveringLauncher.current) setTooltipOpen(false)
                  }}
                  onPointerUp={(event) => endDrag(event)}
                  onPointerCancel={(event) => endDrag(event, true)}
                  onLostPointerCapture={(event) => endDrag(event, true)}
                  aria-label="Ask Milo"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="size-12 touch-none rounded-full shadow-lg sm:h-10 sm:w-auto sm:px-4"
                >
                  <span aria-hidden="true">✦</span>
                  <span className="hidden sm:inline">Ask Milo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side={isTop ? "bottom" : "top"} sideOffset={6}>
                {shortcut}
              </TooltipContent>
            </Tooltip>
          </div>
          <section
            id={panelId}
            ref={panelRef}
            style={panelStyle}
            role="dialog"
            aria-labelledby="milo-panel-title"
            aria-describedby="milo-panel-description"
            onKeyDown={moveByKeyboard}
            hidden={!isOpen}
            className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden border bg-background [padding-top:env(safe-area-inset-top)] [padding-right:env(safe-area-inset-right)] [padding-bottom:env(safe-area-inset-bottom)] [padding-left:env(safe-area-inset-left)] text-foreground shadow-xl sm:inset-auto sm:h-[min(640px,calc(100dvh-20px))] sm:w-[min(400px,calc(100vw-20px))] sm:rounded-xl sm:p-0"
          >
            <div
              className={`flex shrink-0 items-center justify-between border-b px-4 py-3 sm:touch-none ${dragging ? "sm:cursor-grabbing" : "sm:cursor-grab"}`}
              onClickCapture={(event) => {
                if (suppressClick.current) {
                  event.preventDefault()
                  event.stopPropagation()
                  suppressClick.current = false
                }
              }}
              onPointerDown={(event) => startDrag(event, true)}
              onPointerMove={moveDrag}
              onPointerUp={(event) => endDrag(event)}
              onPointerCancel={(event) => endDrag(event, true)}
              onLostPointerCapture={(event) => endDrag(event, true)}
            >
              <p id="milo-panel-description" className="sr-only">
                On desktop, drag the title bar or use Alt and the arrow keys to
                move Milo.
              </p>
              <h2 id="milo-panel-title" className="font-semibold">
                Milo
              </h2>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="New chat"
                      onClick={() => chatRef.current?.newChat()}
                    >
                      <SquarePen aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New chat</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="History"
                      onClick={() => chatRef.current?.showHistory()}
                    >
                      <History aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>History</TooltipContent>
                </Tooltip>
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
            {hasOpened && (
              <WikiChat
                ref={chatRef}
                firstName={firstName}
                currentPath={pathname}
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
            )}
          </section>
        </>
      ) : null}
    </WikiChatModalContext.Provider>
  )
}
