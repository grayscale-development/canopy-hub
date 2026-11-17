import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { wikiAlertsJobGate } from "@/lib/wiki-alerts-job-gate"
import { scanWikiAlerts } from "@/lib/wiki-alert-scan"

export async function POST(request: Request) {
  const gate = wikiAlertsJobGate()
  if (!gate.allowed)
    return NextResponse.json({ error: gate.reason }, { status: 403 })
  const secret = process.env.CANOPY_ALERTS_SCAN_SECRET
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1]
  const expected = Buffer.from(secret ?? "")
  const actual = Buffer.from(bearer ?? "")
  if (
    !secret ||
    !bearer ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json(await scanWikiAlerts(createSupabaseAdminClient()))
  } catch {
    return NextResponse.json(
      { error: "Unable to scan wiki alerts." },
      { status: 500 }
    )
  }
}
