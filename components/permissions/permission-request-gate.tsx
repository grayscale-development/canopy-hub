"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import {
  requestPermissionAction,
  type RequestPermissionResult,
} from "@/app/permissions/actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DisableableElementProps = {
  disabled?: boolean
  "aria-disabled"?: boolean
  title?: string
  onClick?: React.MouseEventHandler
  className?: string
}

function getPortalPopupClassName(className?: string) {
  return className
    ?.split(/\s+/)
    .filter((token) => {
      return !/^(top|right|bottom|left|mt|mb|translate)-/.test(token)
    })
    .join(" ")
}

export function PermissionRequestGate({
  hasPermission,
  permissionCode,
  permissionName,
  children,
  className,
  popupClassName,
}: {
  hasPermission: boolean
  permissionCode: string
  permissionName: string
  children: React.ReactElement<DisableableElementProps>
  className?: string
  popupClassName?: string
}) {
  const triggerRef = React.useRef<HTMLSpanElement | null>(null)
  const popupRef = React.useRef<HTMLSpanElement | null>(null)
  const closeTimerRef = React.useRef<number | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)
  const [popupPosition, setPopupPosition] = React.useState({
    top: 0,
    left: 0,
  })
  const [result, setResult] = React.useState<RequestPermissionResult | null>(
    null
  )
  const [isPending, startTransition] = React.useTransition()
  const portalPopupClassName = getPortalPopupClassName(popupClassName)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  function openPopup() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setIsOpen(true)
  }

  function closePopup() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false)
      closeTimerRef.current = null
    }, 120)
  }

  const updatePopupPosition = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }

    const rect = trigger.getBoundingClientRect()
    const popupWidth = popupRef.current?.offsetWidth ?? 288
    const popupHeight = popupRef.current?.offsetHeight ?? 128
    const viewportPadding = 8
    const alignRight =
      popupClassName?.includes("right-0") ||
      popupClassName?.includes("left-auto")
    const preferredLeft = alignRight ? rect.right - popupWidth : rect.left
    const left = Math.min(
      Math.max(preferredLeft, viewportPadding),
      window.innerWidth - popupWidth - viewportPadding
    )
    const top =
      rect.bottom + popupHeight + viewportPadding > window.innerHeight
        ? Math.max(rect.top - popupHeight, viewportPadding)
        : rect.bottom

    setPopupPosition({ top, left })
  }, [popupClassName])

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    updatePopupPosition()
    window.addEventListener("resize", updatePopupPosition)
    window.addEventListener("scroll", updatePopupPosition, true)

    return () => {
      window.removeEventListener("resize", updatePopupPosition)
      window.removeEventListener("scroll", updatePopupPosition, true)
    }
  }, [isOpen, updatePopupPosition])

  if (hasPermission) {
    return children
  }

  function requestPermission() {
    const formData = new FormData()
    formData.set("permission_code", permissionCode)

    setResult(null)
    startTransition(async () => {
      const nextResult = await requestPermissionAction(formData)
      setResult(nextResult)
    })
  }

  const disabledChild = React.cloneElement(children, {
    disabled: true,
    "aria-disabled": true,
    title: `Requires "${permissionName}"`,
    onClick: (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
    },
  })

  const popup =
    isMounted && isOpen
      ? createPortal(
          <span
            ref={popupRef}
            onPointerEnter={openPopup}
            onPointerLeave={closePopup}
            className={cn(
              "fixed z-[2147483647] block w-72 rounded-lg border bg-popover p-3 text-left text-popover-foreground shadow-xl",
              portalPopupClassName
            )}
            style={{
              top: popupPosition.top,
              left: popupPosition.left,
            }}
          >
            <span className="block text-sm">
              In order to perform this action, the &quot;{permissionName}&quot;
              permission is required.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 w-full justify-center bg-background"
              onClick={requestPermission}
              disabled={isPending}
            >
              {isPending ? "Requesting..." : "Request permission"}
            </Button>
            {result ? (
              <span
                className={cn(
                  "mt-2 block text-xs",
                  result.ok ? "text-emerald-600" : "text-destructive"
                )}
              >
                {result.message}
              </span>
            ) : null}
          </span>,
          document.body
        )
      : null

  return (
    <span
      ref={triggerRef}
      tabIndex={0}
      onPointerEnter={openPopup}
      onPointerLeave={closePopup}
      onFocus={openPopup}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget
        if (
          nextFocusedElement instanceof Node &&
          popupRef.current?.contains(nextFocusedElement)
        ) {
          return
        }
        setIsOpen(false)
      }}
      className={cn(
        "group/permission relative inline-flex w-fit max-w-full",
        className
      )}
    >
      {disabledChild}
      {popup}
    </span>
  )
}
