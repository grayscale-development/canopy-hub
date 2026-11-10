export type EvalCase = {
  id: string
  question: string
  kind: "answerable" | "unanswerable" | "restricted"
  expectedPages: string[]
  forbiddenPages?: string[]
}

export type EvalRow = {
  page: string | null
  title: string
  url: string | null
}

export type EvalResult = {
  testCase: EvalCase
  rows: EvalRow[]
  expectedUrls: Record<string, string>
}

export type Metrics = {
  hitAt1: number
  hitAt3: number
  citationCorrectness: number
  abstentionRate: number
}

export function scoreResults(results: EvalResult[]): Metrics {
  const answerable = results.filter(
    ({ testCase }) => testCase.kind === "answerable"
  )
  const unanswerable = results.filter(
    ({ testCase }) => testCase.kind === "unanswerable"
  )
  if (!answerable.length || !unanswerable.length)
    throw new Error(
      "The golden set must include answerable and unanswerable cases"
    )
  const hit = (result: EvalResult, count: number) =>
    result.rows
      .slice(0, count)
      .some(
        (row) =>
          row.page !== null && result.testCase.expectedPages.includes(row.page)
      )
  const cited = answerable.flatMap((result) =>
    result.rows
      .slice(0, 3)
      .filter(
        (row) =>
          row.page !== null && result.testCase.expectedPages.includes(row.page)
      )
      .map((row) => row.url === result.expectedUrls[row.page!])
  )
  return {
    hitAt1:
      answerable.filter((result) => hit(result, 1)).length / answerable.length,
    hitAt3:
      answerable.filter((result) => hit(result, 3)).length / answerable.length,
    citationCorrectness: cited.length
      ? cited.filter(Boolean).length / cited.length
      : 0,
    abstentionRate:
      unanswerable.filter((result) => result.rows.length === 0).length /
      unanswerable.length,
  }
}

export function regressions(
  actual: Metrics,
  baseline: Metrics,
  tolerance: number
) {
  return (Object.keys(baseline) as (keyof Metrics)[]).filter(
    (key) =>
      !Number.isFinite(actual[key]) ||
      actual[key] + tolerance < baseline[key] - 1e-12
  )
}
