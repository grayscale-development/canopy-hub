// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it } from "vitest"

import { MiloFlagsTable } from "@/app/settings/[section]/milo-flags-table"

afterEach(cleanup)

it("explains what shared feedback will appear and has a resolved empty state", async () => {
  render(<MiloFlagsTable initialFlags={[]} />)
  expect(
    screen.getByText(
      "No shared feedback yet. When someone flags an answer, it will appear here."
    )
  ).toBeVisible()
  await userEvent.click(screen.getByRole("button", { name: "Resolved" }))
  expect(screen.getByText("No resolved feedback yet.")).toBeVisible()
})
