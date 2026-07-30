import { beforeEach, describe, expect, it, vi } from "vitest"

const testState = vi.hoisted(() => ({
  user: null as {
    id: string
    email?: string | null
    identities?: Array<{ provider?: string; identity_data?: unknown }> | null
    user_metadata?: unknown
  } | null,
  permissions: [] as Array<Record<string, unknown>>,
  permissionRequests: [] as Array<Record<string, unknown>>,
  insertError: null as { code?: string; message: string } | null,
}))

const redirect = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`redirect:${path}`)
}))

vi.mock("next/navigation", () => ({
  redirect,
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: testState.user } }),
    },
    from: (table: "permissions" | "permission_requests") => {
      if (table === "permissions") {
        return {
          select: () => ({
            eq: (_key: string, value: string) => ({
              maybeSingle: async () => ({
                data:
                  testState.permissions.find(
                    (permission) => permission.code === value
                  ) ?? null,
                error: null,
              }),
            }),
          }),
        }
      }

      return {
        insert: async (row: Record<string, unknown>) => {
          if (testState.insertError) {
            return { error: testState.insertError }
          }
          testState.permissionRequests.push(row)
          return { error: null }
        },
      }
    },
  }),
}))

function formDataFor(permissionCode: string) {
  const formData = new FormData()
  formData.set("permission_code", permissionCode)
  return formData
}

describe("requestPermissionAction", () => {
  beforeEach(() => {
    redirect.mockClear()
    testState.user = {
      id: "user-1",
      email: "local-dev@canopy.test",
      user_metadata: { full_name: "Local Dev" },
      identities: null,
    }
    testState.permissions = [
      {
        id: "permission-1",
        code: "permissions.edit",
        name: "Edit Permissions",
      },
    ]
    testState.permissionRequests = []
    testState.insertError = null
  })

  it("requires a permission code before touching the database", async () => {
    const { requestPermissionAction } = await import("@/app/permissions/actions")

    await expect(requestPermissionAction(new FormData())).resolves.toEqual({
      ok: false,
      message: "Permission code is required.",
    })
    expect(testState.permissionRequests).toEqual([])
  })

  it("creates a pending permission request for the signed-in user", async () => {
    const { requestPermissionAction } = await import("@/app/permissions/actions")

    await expect(
      requestPermissionAction(formDataFor("permissions.edit"))
    ).resolves.toEqual({
      ok: true,
      message: "Permission request sent.",
    })

    expect(testState.permissionRequests).toEqual([
      {
        permission_id: "permission-1",
        requested_by: "user-1",
        requester_email: "local-dev@canopy.test",
        requester_name: "Local Dev",
      },
    ])
  })

  it("treats an existing pending request as a successful request", async () => {
    testState.insertError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    }
    const { requestPermissionAction } = await import("@/app/permissions/actions")

    await expect(
      requestPermissionAction(formDataFor("permissions.edit"))
    ).resolves.toEqual({
      ok: true,
      message: "A request for this permission is already pending.",
    })
  })

  it("redirects anonymous users to login", async () => {
    testState.user = null
    const { requestPermissionAction } = await import("@/app/permissions/actions")

    await expect(
      requestPermissionAction(formDataFor("permissions.edit"))
    ).rejects.toThrow("redirect:/login")
    expect(redirect).toHaveBeenCalledWith("/login")
  })
})
