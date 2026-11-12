"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { sidebarHighlightRanges } from "@/lib/wiki-sidebar-filter"
import { cn } from "@/lib/utils"

const SIDEBAR_TOOLTIP_DELAY_MS = 700

function readPersistedExpansion(storageKey: string) {
  if (typeof window === "undefined") {
    return null
  }

  const savedValue = window.localStorage.getItem(storageKey)
  if (savedValue === "open") {
    return true
  }
  if (savedValue === "closed") {
    return false
  }

  return null
}

function writePersistedExpansion(storageKey: string, isOpen: boolean) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(storageKey, isOpen ? "open" : "closed")
}

export function usePersistedSidebarExpansion(
  storageKey: string,
  defaultOpen: boolean,
  autoOpen: boolean,
  forceOpen = false
) {
  const hasUserSetPreference = React.useRef(false)
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  React.useEffect(() => {
    if (hasUserSetPreference.current) {
      return
    }

    const savedValue = readPersistedExpansion(storageKey)
    setIsOpen(savedValue ?? (autoOpen || defaultOpen))
  }, [storageKey, defaultOpen, autoOpen])

  const setPersistedOpen = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      hasUserSetPreference.current = true
      setIsOpen((current) => {
        const next =
          typeof value === "function"
            ? (value as (currentValue: boolean) => boolean)(current)
            : value
        writePersistedExpansion(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  return [forceOpen || isOpen, setPersistedOpen] as const
}

function toggleExpansionWithoutScrollJump(
  event: React.MouseEvent<HTMLButtonElement>,
  toggle: () => void
) {
  const button = event.currentTarget
  const sidebar = button.closest<HTMLElement>("[data-wiki-sidebar-scroll]")
  const buttonTop = button.getBoundingClientRect().top
  const scrollTop = sidebar?.scrollTop

  toggle()

  if (!sidebar || scrollTop === undefined) {
    return
  }

  window.requestAnimationFrame(() => {
    sidebar.scrollTop =
      scrollTop + button.getBoundingClientRect().top - buttonTop
  })
}

export function TruncatedTitle({
  title,
  query = "",
}: {
  title: string
  query?: string
}) {
  const textRef = React.useRef<HTMLSpanElement>(null)
  const [open, setOpen] = React.useState(false)
  const ranges = sidebarHighlightRanges(title, query)
  const highlighted = ranges.flatMap((range, index) => {
    return [
      title.slice(index ? ranges[index - 1].end : 0, range.start),
      <mark
        key={range.start}
        className="rounded-sm bg-yellow-200 text-yellow-950 dark:bg-yellow-700 dark:text-yellow-50"
      >
        {title.slice(range.start, range.end)}
      </mark>,
    ]
  })

  return (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      open={open}
      onOpenChange={(nextOpen) => {
        const element = textRef.current
        const isCutOff = Boolean(
          element && element.scrollWidth > element.clientWidth
        )
        setOpen(nextOpen && isCutOff)
      }}
    >
      <TooltipTrigger asChild>
        <span ref={textRef} className="truncate">
          {highlighted}
          {title.slice(ranges.at(-1)?.end ?? 0)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={8}>
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

export function SidebarExpansionToggle({
  label,
  contentId,
  isOpen,
  setOpen,
  disabled = false,
}: {
  label: string
  contentId: string
  isOpen: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={`Toggle ${label}`}
      aria-expanded={isOpen}
      aria-controls={contentId}
      disabled={disabled}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default"
      onClick={(event) =>
        toggleExpansionWithoutScrollJump(event, () =>
          setOpen((current) => !current)
        )
      }
    >
      <ChevronRightIcon
        className={cn("size-3.5 transition-transform", isOpen && "rotate-90")}
      />
    </button>
  )
}

export function SidebarAccordionHeader({
  label,
  title,
  contentId,
  isOpen,
  setOpen,
  tone,
  href,
  isActive = false,
  query,
  filterMatch = false,
  disabled = false,
  children,
}: {
  label: string
  title: string
  contentId: string
  isOpen: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  tone: "section" | "group"
  href?: string
  isActive?: boolean
  query?: string
  filterMatch?: boolean
  disabled?: boolean
  children?: React.ReactNode
}) {
  const titleNode = <TruncatedTitle title={title} query={query} />
  const labelClassName = cn(
    "flex min-h-8 min-w-0 flex-1 items-center rounded-md py-1 pr-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    tone === "section" && "text-inherit"
  )

  return (
    <div
      className={cn(
        "group flex min-h-8 w-full items-center rounded-md text-sm leading-5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        tone === "section"
          ? "font-semibold text-sidebar-foreground"
          : "text-muted-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <SidebarExpansionToggle
        label={label}
        contentId={contentId}
        isOpen={isOpen}
        setOpen={setOpen}
        disabled={disabled}
      />
      {href ? (
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          data-wiki-filter-match={filterMatch ? "" : undefined}
          className={labelClassName}
        >
          {titleNode}
        </Link>
      ) : (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          className={cn(labelClassName, "cursor-pointer")}
          onClick={(event) =>
            toggleExpansionWithoutScrollJump(event, () =>
              setOpen((current) => !current)
            )
          }
        >
          {titleNode}
        </button>
      )}
      {children}
    </div>
  )
}
