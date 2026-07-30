// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PermissionRequestGate } from "@/components/permissions/permission-request-gate"

const requestPermissionAction = vi.hoisted(() => vi.fn())

vi.mock("@/app/permissions/actions", () => ({
  requestPermissionAction,
}))

describe("PermissionRequestGate", () => {
  beforeEach(() => {
    requestPermissionAction.mockReset()
    requestPermissionAction.mockResolvedValue({
      ok: true,
      message: "Permission request sent.",
    })
  })

  it("renders the child normally when permission is granted", () => {
    render(
      <PermissionRequestGate
        hasPermission
        permissionCode="wiki.manage"
        permissionName="Edit Wiki"
      >
        <button type="button">Create section</button>
      </PermissionRequestGate>
    )

    expect(
      screen.getByRole("button", { name: "Create section" })
    ).not.toBeDisabled()
    expect(
      screen.queryByText(/permission is required/i)
    ).not.toBeInTheDocument()
  })

  it("disables protected actions and requests the exact permission from the popup", async () => {
    const user = userEvent.setup()
    render(
      <PermissionRequestGate
        hasPermission={false}
        permissionCode="permissions.edit"
        permissionName="Edit Permissions"
      >
        <button type="button">Edit permission</button>
      </PermissionRequestGate>
    )

    const protectedButton = screen.getByRole("button", {
      name: "Edit permission",
    })
    expect(protectedButton).toBeDisabled()
    expect(protectedButton).toHaveAttribute(
      "title",
      'Requires "Edit Permissions"'
    )

    await user.hover(protectedButton)

    const message = await screen.findByText(
      'In order to perform this action, the "Edit Permissions" permission is required.'
    )
    expect(message.parentElement).toHaveClass("z-[2147483647]")

    const requestButton = screen.getByRole("button", {
      name: "Request permission",
    })
    expect(requestButton).toHaveClass("w-full")
    expect(requestButton).toHaveAttribute("data-variant", "outline")

    await user.click(requestButton)

    await waitFor(() => {
      expect(requestPermissionAction).toHaveBeenCalledOnce()
    })
    const formData = requestPermissionAction.mock.calls[0][0] as FormData
    expect(formData.get("permission_code")).toBe("permissions.edit")
    expect(
      await screen.findByText("Permission request sent.")
    ).toBeInTheDocument()
  })
})
