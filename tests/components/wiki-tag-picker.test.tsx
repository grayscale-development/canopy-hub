// @vitest-environment jsdom

import * as React from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WikiTagPicker } from "@/components/wiki/wiki-tag-picker"
import type { WikiScopedTag } from "@/lib/wiki"

const sectionId = "10000000-0000-4000-8000-000000000001"
const otherId = "10000000-0000-4000-8000-000000000002"
const sectionTag = (name: string, section = sectionId): WikiScopedTag => ({
  name,
  scope: "section",
  section_id: section,
})
const globalTag = (name: string): WikiScopedTag => ({
  name,
  scope: "global",
  section_id: null,
})

function Harness({
  initial = [],
  available = [
    sectionTag("Assets"),
    sectionTag("Credit"),
    globalTag("Income"),
    sectionTag("Elsewhere", otherId),
  ],
  canManage = true,
  section = sectionId,
}: {
  initial?: WikiScopedTag[]
  available?: WikiScopedTag[]
  canManage?: boolean
  section?: string | null
}) {
  const [selected, setSelected] = React.useState(initial)
  return (
    <form aria-label="Tags form">
      <WikiTagPicker
        availableTags={available}
        selectedTags={selected}
        onSelectedTagsChange={setSelected}
        sectionId={section}
        canManage={canManage}
        open
        inputId="wiki-tags"
      />
    </form>
  )
}

function submittedTags() {
  return JSON.parse(
    String(
      new FormData(
        screen.getByRole("form", { name: "Tags form" }) as HTMLFormElement
      ).get("tags_scoped")
    )
  )
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(224)
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("WikiTagPicker", () => {
  it("keeps the directory filter flat without labeling its name-only tags global", async () => {
    function DirectoryFilter() {
      const [selected, setSelected] = React.useState<WikiScopedTag[]>([])
      return (
        <WikiTagPicker
          availableTags={[globalTag("Credit")]}
          selectedTags={selected}
          onSelectedTagsChange={setSelected}
          sectionId={null}
          canManage={false}
          open
          inputId="directory-filter"
          allowCreate={false}
          showLevels={false}
        />
      )
    }
    const user = userEvent.setup()
    render(<DirectoryFilter />)
    expect(screen.queryByText("Global")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Credit" }))
    expect(screen.getByRole("button", { name: "Remove Credit" })).toBeVisible()
    expect(screen.queryByText("Global tag:")).not.toBeInTheDocument()
  })

  it("groups matching tags by level, with selected first and other sections hidden", async () => {
    const user = userEvent.setup()
    render(<Harness initial={[sectionTag("Credit"), globalTag("Income")]} />)
    const list = within(screen.getByLabelText("Available tags"))
    expect(list.getByText("In this section")).toBeVisible()
    expect(list.getByText("Global")).toBeVisible()
    expect(
      list.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["Credit", "Assets", "Income"])
    expect(list.queryByText("Elsewhere")).not.toBeInTheDocument()
    expect(screen.getByText("Global tag:")).toHaveClass("sr-only")
    await user.type(screen.getByRole("textbox"), "ass")
    expect(list.getByRole("button", { name: "Assets" })).toBeVisible()
    expect(
      list.queryByRole("button", { name: "Credit" })
    ).not.toBeInTheDocument()
    expect(
      list.queryByRole("button", { name: "Income" })
    ).not.toBeInTheDocument()
    expect(list.getByText("No matching tags")).toBeVisible()
  })

  it("defaults to section and lets a manager make the next tag global", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const search = screen.getByRole("textbox")
    await user.type(search, "Local")
    expect(
      screen.getByRole("button", { name: /Create “Local”.*This section only/ })
    ).toBeVisible()
    await user.keyboard("{Enter}")
    expect(submittedTags()).toEqual([sectionTag("Local")])
    await user.type(search, "Shared")
    await user.click(screen.getByRole("switch", { name: /Make global/ }))
    await user.click(
      screen.getByRole("button", { name: /Create “Shared”.*Global/ })
    )
    expect(submittedTags()).toEqual([sectionTag("Local"), globalTag("Shared")])
    expect(
      screen.getByRole("button", { name: "Remove Shared, global tag" })
    ).toBeVisible()
  })

  it("hides the global option from non-managers and explains root-level creation", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Harness canManage={false} />)
    await user.type(screen.getByRole("textbox"), "Fresh")
    expect(
      screen.queryByRole("switch", { name: /Make global/ })
    ).not.toBeInTheDocument()
    rerender(<Harness section={null} />)
    expect(screen.getByText(/no section/)).toBeVisible()
    expect(
      screen.queryByRole("switch", { name: /Make global/ })
    ).not.toBeInTheDocument()
    await user.keyboard("{Enter}")
    expect(submittedTags()).toEqual([globalTag("Fresh")])
  })

  it("uses exact matches case-insensitively instead of creating, including with Enter", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole("textbox"), "inCOME")
    expect(screen.getByText("Use existing")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /Create/ })
    ).not.toBeInTheDocument()
    await user.keyboard("{Enter}")
    expect(submittedTags()).toEqual([globalTag("Income")])
  })

  it("enforces the 12-tag limit while allowing removal", async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={Array.from({ length: 12 }, (_, i) => sectionTag(`Tag ${i}`))}
      />
    )
    await user.type(screen.getByRole("textbox"), "New")
    expect(screen.getByRole("button", { name: /Create “New”/ })).toBeDisabled()
    await user.keyboard("{Enter}")
    expect(submittedTags()).toHaveLength(12)
    await user.click(screen.getByRole("button", { name: "Remove Tag 0" }))
    await user.click(screen.getByRole("textbox"))
    await user.keyboard("{Enter}")
    expect(submittedTags()).toHaveLength(12)
    expect(submittedTags()).toContainEqual(sectionTag("New"))
  })
})
