"use client"

import * as React from "react"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"

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
  autoOpen: boolean
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

  return [isOpen, setPersistedOpen] as const
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

export function SidebarExpansionToggle({
  label,
  contentId,
  isOpen,
  setOpen,
  children,
}: {
  label: string
  contentId: string
  isOpen: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  children?: React.ReactNode
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Toggle ${label}`}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      {children ? (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="min-h-8 flex-1 cursor-pointer text-left"
          onClick={(event) =>
            toggleExpansionWithoutScrollJump(event, () =>
              setOpen((current) => !current)
            )
          }
        >
          {children}
        </button>
      ) : null}
    </>
  )
}
