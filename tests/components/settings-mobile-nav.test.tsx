// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

import { SettingsMobileNav } from "@/app/settings/[section]/settings-mobile-nav"

afterEach(() => {
  cleanup()
  push.mockClear()
})

it("shows only available sections in a flat list and navigates on selection", async () => {
  const user = userEvent.setup()
  render(
    <SettingsMobileNav
      items={[
        { key: "permissions", label: "Permissions" },
        { key: "feedback", label: "Feedback" },
      ]}
      active="permissions"
    />
  )
  const select = screen.getByRole("combobox", { name: "Settings section" })
  expect(select).toHaveValue("permissions")
  expect(
    within(select)
      .getAllByRole("option")
      .map((option) => option.textContent)
  ).toEqual(["Permissions", "Feedback"])
  expect(select.querySelector("optgroup")).toBeNull()
  await user.selectOptions(select, "feedback")
  expect(push).toHaveBeenCalledWith("/settings/feedback")
})

it("does not select a different section when the current page is gated", () => {
  render(
    <SettingsMobileNav
      items={[{ key: "feedback", label: "Feedback" }]}
      active="permissions"
    />
  )
  const select = screen.getByRole("combobox", { name: "Settings section" })
  expect(select).toHaveValue("")
  expect(
    within(select).getByRole("option", { name: "Select a settings section" })
  ).toBeDisabled()
})
