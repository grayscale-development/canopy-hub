import { expect, it, vi } from "vitest"

import { MiloTiming } from "@/lib/milo/timing"

it("logs only timing fields, never question or answer text", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {})
  try {
    const timing = new MiloTiming()
    Object.assign(timing, {
      question: "private question",
      answer: "private answer",
      userId: "private user",
    })
    timing.model("agent", "fake-chat", "low")
    await timing.measure("agentCall", async () => "private answer")
    timing.log()
    expect(log).toHaveBeenCalledOnce()
    const record = JSON.stringify(log.mock.calls[0][1])
    expect(record).not.toContain("private question")
    expect(record).not.toContain("private answer")
    expect(record).not.toContain("private user")
    expect(log.mock.calls[0][1]).toMatchObject({
      models: { agent: "fake-chat" },
      ms: { agentCall: [expect.any(Number)], total: expect.any(Number) },
    })
  } finally {
    log.mockRestore()
  }
})
