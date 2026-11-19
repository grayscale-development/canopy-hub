"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"

import {
  ADVANCED_SETTINGS_ACCESS_PERMISSION,
  SETTINGS_ACCESS_PERMISSION,
} from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { scanWikiAlerts } from "@/lib/wiki-alert-scan"
import { wikiAlertsJobGate } from "@/lib/wiki-alerts-job-gate"

export type AlertsRunResult =
  | { ok: false; message: string }
  | {
      ok: true
      pages: number
      opened: number
      updated: number
      durationMs: number
      partial: boolean
      unchanged: boolean
    }

export async function runWikiAlertsAction(): Promise<AlertsRunResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user)
      return { ok: false, message: "You don't have access to run alerts." }
    const [settings, advanced] = await Promise.all([
      userHasPermissionCode({
        supabase,
        userId: user.id,
        code: SETTINGS_ACCESS_PERMISSION,
      }),
      userHasPermissionCode({
        supabase,
        userId: user.id,
        code: ADVANCED_SETTINGS_ACCESS_PERMISSION,
      }),
    ])
    if (!settings || !advanced)
      return { ok: false, message: "You don't have access to run alerts." }
    if (!wikiAlertsJobGate().allowed)
      return { ok: false, message: "Alerts can't run in this environment." }
    const admin = createSupabaseAdminClient()
    const token = randomUUID()
    const lock = await admin.rpc("acquire_wiki_alert_manual_scan", {
      p_token: token,
    })
    if (lock.error)
      return {
        ok: false,
        message: "Unable to start the alerts check. Please try again.",
      }
    if (!lock.data)
      return {
        ok: false,
        message: "An alerts check is already running. Please try again later.",
      }
    const start = Date.now()
    try {
      const result = await scanWikiAlerts(admin)
      revalidatePath("/settings/alerts")
      return {
        ok: true,
        pages: result.skipped ? 0 : result.pages,
        opened: result.skipped ? 0 : result.opened,
        updated: result.skipped ? 0 : result.updated,
        durationMs: Date.now() - start,
        partial:
          result.stateSaved === false ||
          (!result.skipped && result.partial === true),
        unchanged: result.skipped,
      }
    } finally {
      const released = await admin.rpc("release_wiki_alert_manual_scan", {
        p_token: token,
      })
      if (released.error)
        console.error("Wiki alerts scan lease could not be released")
    }
  } catch {
    return {
      ok: false,
      message: "Unable to run the alerts check. Please try again.",
    }
  }
}
