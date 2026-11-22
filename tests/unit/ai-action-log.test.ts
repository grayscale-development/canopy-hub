import { describe, expect, it, vi } from "vitest"
import { logAiAction } from "@/lib/ai-action-log"

describe("AI action log", () => {
  it("uses fixed summaries and sends user actions through the authenticated function", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await logAiAction({ rpc } as never, { type: "milo_answer" })
    await logAiAction({ rpc } as never, {
      type: "alert_apply",
      pageId: "page",
      alertId: "alert",
    })
    expect(rpc.mock.calls).toEqual([
      [
        "log_user_ai_action",
        {
          p_action_type: "milo_answer",
          p_target_page_id: null,
          p_target_alert_id: null,
        },
      ],
      [
        "log_user_ai_action",
        {
          p_action_type: "alert_apply",
          p_target_page_id: "page",
          p_target_alert_id: "alert",
        },
      ],
    ])
  })

  it("suppresses database and transport errors without leaking details", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "private data" } })
      .mockRejectedValueOnce(new Error("private data"))
    await logAiAction({ rpc } as never, { type: "milo_answer" })
    await logAiAction({ rpc } as never, { type: "milo_answer" })
    expect(error.mock.calls).toEqual([
      ["AI action log write failed"],
      ["AI action log write failed"],
    ])
  })
})
