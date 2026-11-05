// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { WikiPlainDiff } from "@/components/wiki/wiki-plain-diff"

describe("WikiPlainDiff", () => {
  it("uses plain labels and can switch to side by side", async () => {
    const user = userEvent.setup()
    const beforeText = ["Keep the lock steps.", "Send the file today."].join(
      "\n"
    )
    const afterText = ["Keep the lock steps.", "Send the file tomorrow."].join(
      "\n"
    )
    render(
      <WikiPlainDiff
        beforeText={beforeText}
        afterText={afterText}
        beforeTitle="Current page"
        afterTitle="Older version you picked"
      />
    )

    expect(
      screen.getByText(
        "1 part was removed. 1 part was added. 1 part stayed the same."
      )
    ).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "What was removed" })
    ).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "What was added" })
    ).toBeVisible()
    expect(screen.getByRole("heading", { name: "What stayed" })).toBeVisible()
    expect(screen.getAllByText(/today/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/tomorrow/).length).toBeGreaterThan(0)
    expect(screen.getByText("then becomes ↓")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Side by side" }))

    expect(
      screen.getByRole("button", { name: "Side by side" })
    ).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText("then becomes ↓")).not.toBeInTheDocument()
    expect(
      document.querySelector("[data-layout='side-by-side']")
    ).toBeInTheDocument()
  })
})
