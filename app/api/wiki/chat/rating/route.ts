import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (
    !(await userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (
    typeof body?.assistantMessageId !== "string" ||
    !["up", "down"].includes(body?.rating)
  ) {
    return NextResponse.json({ error: "Invalid rating." }, { status: 400 })
  }
  const { error } = await supabase.from("ai_chat_message_ratings").upsert({
    assistant_message_id: body.assistantMessageId,
    user_id: user.id,
    rating: body.rating,
  })
  if (error)
    return NextResponse.json(
      { error: "Unable to save feedback." },
      { status: 400 }
    )
  return NextResponse.json({ ok: true })
}
