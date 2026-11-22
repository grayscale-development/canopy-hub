import "server-only"

import type { SupabaseWikiClient } from "@/lib/wiki"

type Action =
  | { type: "milo_answer" }
  | {
      type: "alert_apply" | "alert_recommendation"
      pageId: string
      alertId: string
      kind?: "identical" | "overlap"
    }

export async function logAiAction(
  supabase: SupabaseWikiClient,
  action: Action
) {
  try {
    const result =
      action.type === "alert_recommendation"
        ? await supabase.from("ai_action_log").insert({
            action_type: action.type,
            target_page_id: action.pageId,
            target_alert_id: action.alertId,
            summary:
              action.kind === "identical"
                ? "Recommended archiving a duplicate page"
                : "Recommended replacing a duplicated passage",
          })
        : await supabase.rpc("log_user_ai_action", {
            p_action_type: action.type,
            p_target_page_id:
              action.type === "alert_apply" ? action.pageId : null,
            p_target_alert_id:
              action.type === "alert_apply" ? action.alertId : null,
          })
    if (result.error) throw result.error
  } catch {
    // Database errors can contain request contents; do not include them in logs.
    console.error("AI action log write failed")
  }
}
