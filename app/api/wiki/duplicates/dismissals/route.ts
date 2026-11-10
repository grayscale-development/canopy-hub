import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { WIKI_MANAGE_PERMISSION } from "@/lib/wiki"

async function change(request: Request, dismiss: boolean) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const permissions = await Promise.all(
    [BETA_1_PERMISSION, WIKI_MANAGE_PERMISSION].map((code) =>
      userHasPermissionCode({ supabase, userId: user.id, code })
    )
  )
  if (permissions.some((allowed) => !allowed))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const body = await request.json().catch(() => null)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (
    !body ||
    typeof body.nodeId !== "string" ||
    !uuid.test(body.nodeId) ||
    typeof body.otherNodeId !== "string" ||
    !uuid.test(body.otherNodeId) ||
    body.nodeId === body.otherNodeId ||
    typeof body.passageHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.passageHash)
  )
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })

  const table = supabase.from("wiki_duplicate_dismissals")
  const { error } = dismiss
    ? await table.upsert(
        {
          node_id: body.nodeId,
          other_node_id: body.otherNodeId,
          passage_hash: body.passageHash,
          dismissed_by: user.id,
        },
        {
          onConflict: "node_id,other_node_id,passage_hash",
          ignoreDuplicates: true,
        }
      )
    : await table
        .delete()
        .eq("node_id", body.nodeId)
        .eq("other_node_id", body.otherNodeId)
        .eq("passage_hash", body.passageHash)
  if (error)
    return NextResponse.json(
      { error: "Could not update dismissal." },
      { status: 500 }
    )
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  return change(request, true)
}
export async function DELETE(request: Request) {
  return change(request, false)
}
