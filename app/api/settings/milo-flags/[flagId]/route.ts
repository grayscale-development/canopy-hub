import { NextResponse } from "next/server"

import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const VALID_STATUSES = new Set(["open", "reviewed", "closed"])

interface UpdateFlagStatusBody {
  status?: unknown
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ flagId: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [canViewSettings, canViewMiloFlags] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: "settings.access",
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: "milo.flags.view",
    }),
  ])

  if (!canViewSettings || !canViewMiloFlags) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { flagId } = await params
  const payload = (await request
    .json()
    .catch(() => null)) as UpdateFlagStatusBody | null
  const status = typeof payload?.status === "string" ? payload.status : ""

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 })
  }

  const adminSupabase = createSupabaseAdminClient()
  const { error } = await adminSupabase
    .from("ai_chat_message_flags")
    .update({ status })
    .eq("id", flagId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
