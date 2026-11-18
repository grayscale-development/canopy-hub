import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const docker = vi.hoisted(() => vi.fn())
vi.mock("node:child_process", () => ({ execFileSync: docker }))

describe("local Supabase readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    docker.mockReset()
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("waits for both auth through Kong and PostgREST before continuing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValue({ status: 200 })
    vi.stubGlobal("fetch", fetchMock)
    const { waitForLocalSupabase } =
      await import("../../scripts/wait-local-supabase.mjs")
    const ready = waitForLocalSupabase()
    await vi.advanceTimersByTimeAsync(2_000)
    await ready
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:54321/rest/v1/")
    expect(docker).not.toHaveBeenCalled()
  })

  it("restarts only the local Kong once for persistent 502s with healthy auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          status:
            url.endsWith("/health") &&
            docker.mock.calls.every(([, args]) => args[0] !== "restart")
              ? 502
              : 200,
        })
      )
    )
    docker.mockImplementation((_command, args: string[]) =>
      args[0] === "inspect" ? "healthy" : ""
    )
    const { waitForLocalSupabase } =
      await import("../../scripts/wait-local-supabase.mjs")
    const ready = waitForLocalSupabase()
    await vi.advanceTimersByTimeAsync(10_000)
    await ready
    const restarts = docker.mock.calls.filter(
      ([, args]) => args[0] === "restart"
    )
    expect(restarts).toHaveLength(1)
    expect(restarts[0][1]).toEqual(["restart", "supabase_kong_canopy-hub-sync"])
  })

  it("times out without restarting Kong while auth is unhealthy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 502 }))
    docker.mockImplementation((_command, args: string[]) =>
      args[0] === "inspect" ? "starting" : ""
    )
    const { waitForLocalSupabase } =
      await import("../../scripts/wait-local-supabase.mjs")
    const ready = expect(waitForLocalSupabase()).rejects.toThrow(
      "readiness timed out"
    )
    await vi.advanceTimersByTimeAsync(60_000)
    await ready
    expect(docker.mock.calls.some(([, args]) => args[0] === "restart")).toBe(
      false
    )
  })
})
