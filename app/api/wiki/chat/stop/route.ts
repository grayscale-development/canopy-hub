import { NextResponse } from "next/server"
import { z } from "zod"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const stopSchema = z.object({
  threadId: z.string().uuid(),
  userMessageId: z.string().uuid(),
})

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const canAccess = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: BETA_1_PERMISSION,
  })
  if (!canAccess)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const payload = stopSchema.safeParse(await request.json().catch(() => null))
  if (!payload.success)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })

  const { threadId, userMessageId } = payload.data
  const { data: thread, error: threadError } = await supabase
    .from("ai_chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (threadError)
    return NextResponse.json({ error: "Could not stop." }, { status: 500 })
  if (!thread)
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })

  const { data: message, error: messageError } = await supabase
    .from("ai_chat_messages")
    .select("metadata")
    .eq("id", userMessageId)
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("role", "user")
    .maybeSingle()
  if (messageError)
    return NextResponse.json({ error: "Could not stop." }, { status: 500 })
  if (!message)
    return NextResponse.json({ error: "Message not found." }, { status: 404 })

  const { data: updated, error: updateError } = await supabase
    .from("ai_chat_messages")
    .update({ metadata: { ...message.metadata, stopRequested: true } })
    .eq("id", userMessageId)
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .eq("role", "user")
    .select("id")
    .maybeSingle()
  if (updateError)
    return NextResponse.json({ error: "Could not stop." }, { status: 500 })
  if (!updated)
    return NextResponse.json({ error: "Message not found." }, { status: 404 })
  return NextResponse.json({ ok: true })
}
