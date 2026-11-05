// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WikiMovePicker } from "@/components/wiki/wiki-move-picker"
import type { WikiNodeRow } from "@/lib/wiki"

const baseNode = {
  status: "published",
  sort_order: 0,
  current_revision_id: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-11-04T00:00:00.000Z",
  updated_at: "2026-11-04T00:00:00.000Z",
} satisfies Partial<WikiNodeRow>

function folder(
  id: string,
  title: string,
  parent_id: string | null = null
): WikiNodeRow {
  return {
    ...baseNode,
    id,
    parent_id,
    type: "folder",
    slug: id,
    title,
  } as WikiNodeRow
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

describe("WikiMovePicker", () => {
  it("shows folders only, excludes the source subtree, and scrolls to opened columns", async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    })
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(640)
    const nodes = [
      folder("root", "Canopy Wiki"),
      folder("source", "Source section", "root"),
      folder("descendant", "Nested group", "source"),
      {
        ...folder("page", "A page", "root"),
        type: "page" as const,
      },
      folder("other", "Other section", "root"),
    ]

    render(
      <WikiMovePicker
        nodes={nodes}
        selectedTargetId="source"
        excludedNodeId="source"
        onSelectedTargetChange={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Canopy Wiki" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "A page" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Source section" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Nested group" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Other section" }))
    expect(scrollTo).toHaveBeenCalledWith({ left: 640, behavior: "smooth" })
  })
})
