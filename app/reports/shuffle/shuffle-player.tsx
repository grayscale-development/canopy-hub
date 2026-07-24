"use client"

import * as React from "react"
import { Maximize2Icon, Minimize2Icon, SkipForwardIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { FeaturedReport } from "@/lib/reports"

function shuffleReports(reports: FeaturedReport[]) {
  const shuffled = [...reports]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ]
  }
  return shuffled
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

export function ShufflePlayer({
  reports,
  minutes,
}: {
  reports: FeaturedReport[]
  minutes: number
}) {
  const intervalMs = Math.max(minutes, 0.25) * 60 * 1000
  const [playlist, setPlaylist] = React.useState(() => shuffleReports(reports))
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [now, setNow] = React.useState(() => Date.now())
  const [nextSwitchAt, setNextSwitchAt] = React.useState(
    () => Date.now() + intervalMs
  )
  const [isHeaderVisible, setIsHeaderVisible] = React.useState(true)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const hideHeaderTimeoutRef = React.useRef<number | null>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  const activeReport = playlist[activeIndex] ?? reports[0]
  const secondsUntilNext = Math.max(
    0,
    Math.ceil((nextSwitchAt - now) / 1000)
  )

  const showHeaderTemporarily = React.useCallback(() => {
    setIsHeaderVisible(true)
    if (hideHeaderTimeoutRef.current !== null) {
      window.clearTimeout(hideHeaderTimeoutRef.current)
    }
    hideHeaderTimeoutRef.current = window.setTimeout(() => {
      setIsHeaderVisible(false)
    }, 3000)
  }, [])

  const advanceReport = React.useCallback(() => {
    setNextSwitchAt(Date.now() + intervalMs)
    setActiveIndex((currentIndex) => {
      const nextIndex = currentIndex + 1
      if (nextIndex < playlist.length) {
        return nextIndex
      }
      setPlaylist(shuffleReports(reports))
      return 0
    })
  }, [intervalMs, playlist.length, reports])

  React.useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  React.useEffect(() => {
    if (playlist.length <= 1) {
      return
    }

    const timeout = window.setTimeout(
      advanceReport,
      Math.max(0, nextSwitchAt - Date.now())
    )
    return () => window.clearTimeout(timeout)
  }, [advanceReport, nextSwitchAt, playlist.length])

  React.useEffect(() => {
    window.moveTo?.(0, 0)
    window.resizeTo?.(window.screen.availWidth, window.screen.availHeight)
    showHeaderTemporarily()
    return () => {
      if (hideHeaderTimeoutRef.current !== null) {
        window.clearTimeout(hideHeaderTimeoutRef.current)
      }
    }
  }, [showHeaderTemporarily])

  React.useEffect(() => {
    window.addEventListener("mousemove", showHeaderTemporarily)
    return () => {
      window.removeEventListener("mousemove", showHeaderTemporarily)
    }
  }, [showHeaderTemporarily])

  React.useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  React.useEffect(() => {
    showHeaderTemporarily()
  }, [activeIndex, showHeaderTemporarily])

  function handleNextReport() {
    advanceReport()
    showHeaderTemporarily()
  }

  async function enterFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
    showHeaderTemporarily()
  }

  function handleIframeLoad() {
    showHeaderTemporarily()
    iframeRef.current?.contentWindow?.addEventListener(
      "mousemove",
      showHeaderTemporarily
    )
  }

  if (!activeReport) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">
          No reports were selected.
        </p>
      </main>
    )
  }

  return (
    <main className="flex h-screen flex-col bg-background">
      <header
        className={`fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b bg-background/95 px-4 shadow-sm backdrop-blur transition-transform duration-300 ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{activeReport.title}</p>
          <p className="text-xs text-muted-foreground">
            Report {activeIndex + 1} of {playlist.length} · switches every{" "}
            {minutes} min
            {playlist.length > 1
              ? ` · next in ${formatCountdown(secondsUntilNext)}`
              : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleNextReport}>
          <SkipForwardIcon />
          Next
        </Button>
        <Button variant="outline" size="sm" onClick={enterFullscreen}>
          {isFullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
          {isFullscreen ? "Exit full screen" : "Full screen"}
        </Button>
      </header>
      <iframe
        ref={iframeRef}
        key={activeReport.id}
        src={activeReport.href}
        title={activeReport.title}
        onLoad={handleIframeLoad}
        className="min-h-0 flex-1 border-0"
      />
    </main>
  )
}
