"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  buildWikiPath,
  findPinnedWikiSectionPagePath,
  isPublishedWikiBranch,
  type WikiNodeRow,
} from "@/lib/wiki"

const WIKI_LAST_PAGE_STORAGE_PREFIX = "wiki:last-page"
const WIKI_EDIT_MODE_STORAGE_KEY = "wiki-edit-mode"

function getLastPageStorageKey(repositorySlug: string) {
  return `${WIKI_LAST_PAGE_STORAGE_PREFIX}:${repositorySlug}`
}

function readSavedPath(repositorySlug: string) {
  try {
    const savedValue = window.localStorage.getItem(
      getLastPageStorageKey(repositorySlug)
    )
    if (!savedValue) {
      return null
    }

    const parsed = JSON.parse(savedValue)
    return typeof parsed === "string" ? parsed : null
  } catch {
    return null
  }
}

function writeSavedPath(repositorySlug: string, path: string) {
  try {
    window.localStorage.setItem(
      getLastPageStorageKey(repositorySlug),
      JSON.stringify(path)
    )
  } catch {
    // Ignore storage errors; the wiki still opens to its fallback page.
  }
}

function canUseDraftPages(canManageWiki: boolean) {
  try {
    return (
      canManageWiki &&
      window.localStorage.getItem(WIKI_EDIT_MODE_STORAGE_KEY) === "edit"
    )
  } catch {
    return false
  }
}

function getValidPagePaths(nodes: WikiNodeRow[], canManageWiki: boolean) {
  const includeDrafts = canUseDraftPages(canManageWiki)

  return new Set(
    nodes
      .filter((node) => {
        return (
          node.type === "page" &&
          (includeDrafts || isPublishedWikiBranch(nodes, node))
        )
      })
      .map((node) => buildWikiPath(nodes, node))
  )
}

export function WikiLastPageRecorder({
  nodes,
  path,
  repositorySlug,
  canManageWiki,
}: {
  nodes: WikiNodeRow[]
  path: string
  repositorySlug: string
  canManageWiki: boolean
}) {
  React.useEffect(() => {
    const validPaths = getValidPagePaths(nodes, canManageWiki)
    if (validPaths.has(path)) {
      writeSavedPath(repositorySlug, path)
    }
  }, [canManageWiki, nodes, path, repositorySlug])

  return null
}

export function WikiLastPageRedirect({
  nodes,
  repositorySlug,
  fallbackPath,
  canManageWiki,
}: {
  nodes: WikiNodeRow[]
  repositorySlug: string
  fallbackPath: string | null
  canManageWiki: boolean
}) {
  const router = useRouter()

  React.useEffect(() => {
    const validPaths = getValidPagePaths(nodes, canManageWiki)
    const savedPath = readSavedPath(repositorySlug)
    const pinnedPath = findPinnedWikiSectionPagePath(
      nodes,
      repositorySlug,
      (node) => validPaths.has(buildWikiPath(nodes, node))
    )
    const nextPath =
      savedPath &&
      savedPath.startsWith(`${repositorySlug}/`) &&
      validPaths.has(savedPath)
        ? savedPath
        : (pinnedPath ?? fallbackPath)

    if (nextPath) {
      router.replace(`/wiki/${nextPath}`)
    }
  }, [canManageWiki, fallbackPath, nodes, repositorySlug, router])

  return null
}
