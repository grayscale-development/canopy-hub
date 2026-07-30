"use client"

import * as React from "react"

import { PermissionRequestGate } from "@/components/permissions/permission-request-gate"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { isPublishedWikiBranch, type WikiNodeRow } from "@/lib/wiki"
import { cn } from "@/lib/utils"

const WIKI_EDIT_MODE_STORAGE_KEY = "wiki-edit-mode"

interface WikiEditModeContextValue {
  canManageWiki: boolean
  isEditorMode: boolean
  canEditWiki: boolean
  setEditorMode: (value: boolean) => void
}

const WikiEditModeContext =
  React.createContext<WikiEditModeContextValue | null>(null)

function readPersistedWikiEditMode() {
  try {
    return window.localStorage.getItem(WIKI_EDIT_MODE_STORAGE_KEY) === "edit"
  } catch {
    return false
  }
}

function writePersistedWikiEditMode(value: boolean) {
  try {
    window.localStorage.setItem(
      WIKI_EDIT_MODE_STORAGE_KEY,
      value ? "edit" : "view"
    )
  } catch {
    // Keep the in-memory mode even if localStorage is unavailable.
  }
}

export function WikiEditModeProvider({
  canManageWiki,
  children,
}: {
  canManageWiki: boolean
  children: React.ReactNode
}) {
  const [isEditorMode, setIsEditorMode] = React.useState(false)

  React.useEffect(() => {
    if (!canManageWiki) {
      setIsEditorMode(false)
      return
    }

    setIsEditorMode(readPersistedWikiEditMode())
  }, [canManageWiki])

  const setEditorMode = React.useCallback(
    (value: boolean) => {
      if (!canManageWiki) {
        return
      }

      setIsEditorMode(value)
      writePersistedWikiEditMode(value)
    },
    [canManageWiki]
  )

  const value = React.useMemo<WikiEditModeContextValue>(
    () => ({
      canManageWiki,
      isEditorMode,
      canEditWiki: canManageWiki && isEditorMode,
      setEditorMode,
    }),
    [canManageWiki, isEditorMode, setEditorMode]
  )

  return (
    <WikiEditModeContext.Provider value={value}>
      {children}
    </WikiEditModeContext.Provider>
  )
}

export function useWikiEditMode() {
  const context = React.useContext(WikiEditModeContext)

  return (
    context ?? {
      canManageWiki: true,
      isEditorMode: true,
      canEditWiki: true,
      setEditorMode: () => undefined,
    }
  )
}

export function WikiEditModeGate({ children }: { children: React.ReactNode }) {
  const { canEditWiki } = useWikiEditMode()

  return canEditWiki ? <>{children}</> : null
}

export function WikiViewModeTitleSpacing({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { canEditWiki } = useWikiEditMode()

  return (
    <div className={cn(className, !canEditWiki && "pt-10")}>{children}</div>
  )
}

export function useVisibleWikiNodes(nodes: WikiNodeRow[]) {
  const { canEditWiki } = useWikiEditMode()

  return React.useMemo(
    () =>
      canEditWiki
        ? nodes
        : nodes.filter((node) => isPublishedWikiBranch(nodes, node)),
    [canEditWiki, nodes]
  )
}

export function WikiVisibleNodeGate({
  node,
  nodes,
  children,
  fallback = null,
}: {
  node: WikiNodeRow
  nodes: WikiNodeRow[]
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { canEditWiki } = useWikiEditMode()

  return canEditWiki || isPublishedWikiBranch(nodes, node) ? (
    <>{children}</>
  ) : (
    <>{fallback}</>
  )
}

export function WikiEditModeToggle({ className }: { className?: string }) {
  const { canManageWiki, isEditorMode, setEditorMode } = useWikiEditMode()
  const switchId = React.useId()

  return (
    <div
      className={cn("flex items-center justify-between gap-3 px-1", className)}
    >
      <Label
        htmlFor={switchId}
        className="text-xs font-semibold text-sidebar-foreground/70 uppercase"
      >
        Editor Mode
      </Label>
      {canManageWiki ? (
        <Switch
          id={switchId}
          checked={isEditorMode}
          onCheckedChange={setEditorMode}
          aria-label="Toggle wiki editor mode"
        />
      ) : (
        <PermissionRequestGate
          hasPermission={canManageWiki}
          permissionCode="wiki.manage"
          permissionName="Manage Wiki"
          popupClassName="right-0 left-auto"
        >
          <Switch
            id={switchId}
            checked={false}
            aria-label="Toggle wiki editor mode"
          />
        </PermissionRequestGate>
      )}
    </div>
  )
}
