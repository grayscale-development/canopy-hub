export type MiloHistoryTurn = { role: "user" | "assistant"; content: string }

type HistoryRow = { role: string; content: string; metadata?: unknown }

export function trimMiloHistory(rows: HistoryRow[]): MiloHistoryTurn[] {
  const eligible = rows
    .filter((row) => {
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {}
      return (
        (row.role === "user" || row.role === "assistant") &&
        typeof row.content === "string" &&
        Boolean(row.content.trim()) &&
        metadata.error !== true
      )
    })
    .slice(-6)
  let remaining = 4000
  const kept: MiloHistoryTurn[] = []
  for (const row of eligible.reverse()) {
    if (!remaining) break
    const content = row.content.trim().slice(-Math.min(1500, remaining))
    kept.unshift({ role: row.role as MiloHistoryTurn["role"], content })
    remaining -= content.length
  }
  return kept
}

export function followUpRetrievalQuery(
  question: string,
  history: MiloHistoryTurn[]
) {
  const previous = [...history].reverse().find((turn) => turn.role === "user")
  if (
    previous &&
    (question.trim().split(/\s+/).length < 8 ||
      /^(?:what about|and\b|how about|what if|also\b)/i.test(question.trim()))
  ) {
    return `${previous.content}\n${question}`
  }
  return question
}
