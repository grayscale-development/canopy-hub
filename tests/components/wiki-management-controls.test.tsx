// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WikiNodeActionsMenu } from "@/components/wiki/wiki-management-controls"
import type { WikiNodeRow } from "@/lib/wiki"

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}))

vi.mock("@/app/wiki/actions", () => ({
  archiveWikiNodeAction: vi.fn(),
  updateWikiNodeAction: vi.fn(),
  createWikiNodeAction: vi.fn(),
}))

const emptyGroup = {
  id: "wiki-group",
  parent_id: "wiki-repository",
  type: "folder",
  slug: "operations",
  title: "Operations",
  status: "published",
  sort_order: 0,
  current_revision_id: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-08-26T00:00:00.000Z",
  updated_at: "2026-08-26T00:00:00.000Z",
  tags: [],
} satisfies WikiNodeRow

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe("WikiNodeActionsMenu", () => {
  it("keeps Archive inside Edit and preserves the empty-folder guard", async () => {
    const user = userEvent.setup()
    render(
      <WikiNodeActionsMenu nodes={[emptyGroup]} node={emptyGroup} hasChildren />
    )

    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Edit" }))

    const dialog = await screen.findByRole("dialog")
    const archiveButton = within(dialog).getByRole("button", {
      name: "Archive",
    })
    expect(archiveButton).toBeDisabled()
    expect(
      within(dialog).getByText(
        "Move or archive the items inside this section or group first."
      )
    ).toBeVisible()
  })
})
