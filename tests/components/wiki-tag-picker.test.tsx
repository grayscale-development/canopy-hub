// @vitest-environment jsdom

import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { WikiTagPicker } from "@/components/wiki/wiki-tag-picker"

function TagPickerHarness() {
  const [selectedTags, setSelectedTags] = React.useState(["Income"])

  return (
    <WikiTagPicker
      availableTags={["Assets", "Credit", "Income"]}
      selectedTags={selectedTags}
      onSelectedTagsChange={setSelectedTags}
      open
      inputId="wiki-tags"
    />
  )
}

describe("WikiTagPicker", () => {
  it("puts selected tags first inside one connected picker surface", () => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(224)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400)

    render(<TagPickerHarness />)

    const options = within(screen.getByLabelText("Available tags"))
    expect(
      options.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["Income", "Assets", "Credit"])
    expect(options.getAllByRole("button")[0]).toHaveClass("w-full", "text-left")
    expect(options.queryByText("Income")?.closest("span")).not.toHaveClass(
      "rounded-full"
    )
    expect(
      screen.getByRole("textbox", { name: "Search or create a tag" })
        .parentElement
    ).toHaveClass("overflow-hidden", "rounded-lg", "border")
    expect(screen.getByText("Income ×")).toHaveClass("rounded-full")
  })
})
