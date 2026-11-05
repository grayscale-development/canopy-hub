// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { WikiPlainDiff } from "@/components/wiki/wiki-plain-diff"

describe("WikiPlainDiff", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows one marked-up page instead of a second breakdown", () => {
    render(
      <WikiPlainDiff
        beforeText="Send the file tomorrow."
        afterText="Send the file today."
        beforeTitle="This page now"
        afterTitle="Page after restore"
      />
    )

    expect(screen.getByText("1 change")).toBeVisible()
    expect(screen.queryByText(/words are taken out/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/words are put in/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Page after restore" })
    ).toBeVisible()
    expect(screen.getByText("tomorrow.")).toHaveClass("line-through")
    expect(screen.getByText("today.")).toHaveClass("underline")
    expect(screen.getByText("Taken out:", { exact: false })).toHaveClass(
      "sr-only"
    )
    expect(
      screen.queryByRole("button", { name: "Side by side" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "What was removed" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("then becomes ↓")).not.toBeInTheDocument()
  })

  it("hides a long unchanged stretch behind one button", async () => {
    const user = userEvent.setup()
    const lines = Array.from(
      { length: 20 },
      (_, index) => `Paragraph ${index + 1} stays the same.`
    )
    const after = [...lines]
    after[10] = "Paragraph 11 is brand new."

    render(
      <WikiPlainDiff
        beforeText={lines.join("\n")}
        afterText={after.join("\n")}
        beforeTitle="This page now"
        afterTitle="Page after update"
      />
    )

    const showRest = screen.getAllByRole("button", {
      name: /Show \d+ lines that don't change/,
    })[0]
    expect(showRest).toBeVisible()
    await user.click(showRest)
    expect(
      screen.getByRole("button", { name: "Hide lines that don't change" })
    ).toBeVisible()
  })

  it("says when nothing changes and when the page will be emptied", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <WikiPlainDiff
        beforeText="Keep the lock steps."
        afterText="Keep the lock steps."
        afterTitle="Page after update"
      />
    )
    expect(
      screen.getByText("Nothing changes. The page stays exactly the same.")
    ).toBeVisible()
    expect(
      screen.queryByRole("heading", { name: "Page after update" })
    ).not.toBeInTheDocument()

    rerender(
      <WikiPlainDiff
        beforeText="Remove this page."
        afterText=""
        afterTitle="Page after update"
      />
    )
    expect(
      screen.getByText(
        "Everything on this page will be taken out. Nothing will be left."
      )
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Show what gets taken out" })
    )
    expect(screen.getByText("Remove this page.")).toHaveClass("line-through")
  })
})
