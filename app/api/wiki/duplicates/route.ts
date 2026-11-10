import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { WIKI_MANAGE_PERMISSION } from "@/lib/wiki"
import {
  detectWikiDuplicates,
  DuplicateInputError,
} from "@/lib/wiki-duplicates"

export const runtime = "nodejs"

export async function POST(request: Request) {
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
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.nodeId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.nodeId
    ) ||
    (body.text !== undefined &&
      (typeof body.text !== "string" || body.text.length > 5000))
  )
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  try {
    const result = await detectWikiDuplicates(
      supabase,
      user.id,
      body.nodeId,
      body.text
    )
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "Page not found." }, { status: 404 })
  } catch (error) {
    if (error instanceof DuplicateInputError)
      return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(
      { error: "Unable to check for duplicates." },
      { status: 500 }
    )
  }
}
