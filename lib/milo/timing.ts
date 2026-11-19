import "server-only"

export type TimingStage =
  | "intent"
  | "retrieval"
  | "embedding"
  | "extraChunks"
  | "agentCall"
  | "toolStep"
  | "assessment"
  | "persistence"
  | "userContext"
  | "pageContext"

// Only fixed stage names and numeric durations are retained; prompts and results
// never enter the timing record.
export class MiloTiming {
  private readonly started = performance.now()
  private readonly durations: Partial<Record<TimingStage, number[]>> = {}
  private readonly models: Partial<
    Record<"intent" | "assessment" | "agent" | "embedding", string>
  > = {}
  private readonly reasoning: Partial<
    Record<"intent" | "assessment" | "agent", string>
  > = {}
  path: "workflow" | "direct" | "agent" | "fallback" = "workflow"
  check: "fast" | "assessment" | "none" = "none"
  abstained = false
  toolLoopSteps = 0
  outcome: "complete" | "error" | "stopped" = "complete"
  private firstTokenMs: number | null = null

  token() {
    this.firstTokenMs ??= Math.round(performance.now() - this.started)
  }

  model(
    stage: "intent" | "assessment" | "agent" | "embedding",
    model: string,
    effort?: string
  ) {
    this.models[stage] = model
    if (stage !== "embedding" && effort) this.reasoning[stage] = effort
  }

  async measure<T>(
    stage: TimingStage,
    action: () => PromiseLike<T>
  ): Promise<T> {
    const started = performance.now()
    try {
      return await action()
    } finally {
      ;(this.durations[stage] ??= []).push(
        Math.round(performance.now() - started)
      )
    }
  }

  log() {
    console.info("Milo timing", {
      path: this.path,
      check: this.check,
      abstained: this.abstained,
      outcome: this.outcome,
      models: { ...this.models },
      reasoning: { ...this.reasoning },
      ms: {
        ...this.durations,
        firstTokenMs: this.firstTokenMs,
        total: Math.round(performance.now() - this.started),
      },
      toolLoopSteps: this.toolLoopSteps,
    })
  }
}

export function measureMilo<T>(
  timing: MiloTiming | undefined,
  stage: TimingStage,
  action: () => PromiseLike<T>
): Promise<T> {
  return timing ? timing.measure(stage, action) : Promise.resolve().then(action)
}
