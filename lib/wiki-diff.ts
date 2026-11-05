export type WikiDiffKind = "stayed" | "removed" | "added"

export interface WikiDiffPiece {
  kind: WikiDiffKind
  text: string
}

export interface WikiDiffTextSegment {
  type: "text"
  pieces: WikiDiffPiece[]
}

export interface WikiDiffFoldSegment {
  type: "fold"
  id: string
  lines: string[]
}

export type WikiDiffSegment = WikiDiffTextSegment | WikiDiffFoldSegment

export interface WikiPlainDiff {
  headline: string
  changeCount: number
  segments: WikiDiffSegment[]
  showMarkup: boolean
  revealTakenOut: boolean
}

interface LineOp {
  type: "same" | "removed" | "added"
  value: string
}

interface DisplayLine {
  changed: boolean
  pieces: WikiDiffPiece[]
}

const MAX_LINE_CELLS = 400_000
const FULL_PAGE_LIMIT = 15
const CONTEXT_LINES = 2
const MIN_FOLD = 3

function splitLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function wordsOf(line: string) {
  return line.match(/\S+/g) ?? []
}

function lineOps(before: string[], after: string[]): LineOp[] {
  if (before.length * after.length > MAX_LINE_CELLS) {
    if (before.join("\n") === after.join("\n")) {
      return before.map((value) => ({ type: "same", value }))
    }
    return [
      ...before.map((value) => ({ type: "removed" as const, value })),
      ...after.map((value) => ({ type: "added" as const, value })),
    ]
  }

  const rows = before.length
  const columns = after.length
  const scores: number[][] = Array.from({ length: rows + 1 }, () =>
    Array<number>(columns + 1).fill(0)
  )
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      scores[row][column] =
        before[row] === after[column]
          ? scores[row + 1][column + 1] + 1
          : Math.max(scores[row + 1][column], scores[row][column + 1])
    }
  }

  const ops: LineOp[] = []
  let row = 0
  let column = 0
  while (row < rows && column < columns) {
    if (before[row] === after[column]) {
      ops.push({ type: "same", value: before[row] })
      row += 1
      column += 1
    } else if (scores[row + 1][column] >= scores[row][column + 1]) {
      ops.push({ type: "removed", value: before[row] })
      row += 1
    } else {
      ops.push({ type: "added", value: after[column] })
      column += 1
    }
  }
  while (row < rows) {
    ops.push({ type: "removed", value: before[row] })
    row += 1
  }
  while (column < columns) {
    ops.push({ type: "added", value: after[column] })
    column += 1
  }
  return ops
}

function pushPiece(pieces: WikiDiffPiece[], kind: WikiDiffKind, text: string) {
  if (!text) return
  const previous = pieces[pieces.length - 1]
  if (previous?.kind === kind) {
    previous.text = `${previous.text} ${text}`
    return
  }
  pieces.push({ kind, text })
}

function overlapRatio(beforeLine: string, afterLine: string) {
  const beforeWords = wordsOf(beforeLine)
  const afterWords = wordsOf(afterLine)
  if (!beforeWords.length || !afterWords.length) return 0
  const remaining = new Map<string, number>()
  for (const word of afterWords) {
    const key = word.toLocaleLowerCase()
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }
  let shared = 0
  for (const word of beforeWords) {
    const key = word.toLocaleLowerCase()
    const count = remaining.get(key) ?? 0
    if (count > 0) {
      shared += 1
      remaining.set(key, count - 1)
    }
  }
  return shared / Math.max(beforeWords.length, afterWords.length)
}

function inlinePieces(beforeLine: string, afterLine: string) {
  const pieces: WikiDiffPiece[] = []
  for (const op of lineOps(wordsOf(beforeLine), wordsOf(afterLine))) {
    pushPiece(
      pieces,
      op.type === "same"
        ? "stayed"
        : op.type === "removed"
          ? "removed"
          : "added",
      op.value
    )
  }
  return pieces
}

function lineText(line: DisplayLine) {
  return line.pieces.map((piece) => piece.text).join(" ")
}

function foldLines(lines: DisplayLine[]): WikiDiffSegment[] {
  if (lines.length <= FULL_PAGE_LIMIT) {
    return lines.map((line) => ({ type: "text", pieces: line.pieces }))
  }

  const segments: WikiDiffSegment[] = []
  let index = 0
  while (index < lines.length) {
    if (lines[index]?.changed) {
      segments.push({ type: "text", pieces: lines[index].pieces })
      index += 1
      continue
    }

    let end = index
    while (end < lines.length && !lines[end]?.changed) end += 1
    const run = lines.slice(index, end)
    const keepStart = index > 0 ? CONTEXT_LINES : 0
    const keepEnd = end < lines.length ? CONTEXT_LINES : 0
    const hiddenCount = run.length - keepStart - keepEnd
    if (hiddenCount < MIN_FOLD) {
      for (const line of run) {
        segments.push({ type: "text", pieces: line.pieces })
      }
    } else {
      for (const line of run.slice(0, keepStart)) {
        segments.push({ type: "text", pieces: line.pieces })
      }
      const hidden = run.slice(keepStart, run.length - keepEnd)
      segments.push({
        type: "fold",
        id: `fold-${index}`,
        lines: hidden.map(lineText),
      })
      for (const line of run.slice(run.length - keepEnd)) {
        segments.push({ type: "text", pieces: line.pieces })
      }
    }
    index = end
  }
  return segments
}

function headlineFor(changeCount: number) {
  return changeCount === 1 ? "1 change" : `${changeCount} changes`
}

export function buildWikiPlainDiff(
  beforeText: string,
  afterText: string
): WikiPlainDiff {
  const beforeLines = splitLines(beforeText)
  const afterLines = splitLines(afterText)
  const identical =
    beforeLines.length === afterLines.length &&
    beforeLines.every((line, index) => line === afterLines[index])

  if (identical) {
    return {
      headline: "Nothing changes. The page stays exactly the same.",
      changeCount: 0,
      segments: [],
      showMarkup: false,
      revealTakenOut: false,
    }
  }

  if (!beforeLines.length) {
    return {
      headline: "This page is empty now. All of this will be put in.",
      changeCount: afterLines.length,
      segments: afterLines.map((line) => ({
        type: "text" as const,
        pieces: [{ kind: "stayed" as const, text: line }],
      })),
      showMarkup: true,
      revealTakenOut: false,
    }
  }

  if (!afterLines.length) {
    return {
      headline:
        "Everything on this page will be taken out. Nothing will be left.",
      changeCount: beforeLines.length,
      segments: beforeLines.map((line) => ({
        type: "text" as const,
        pieces: [{ kind: "removed" as const, text: line }],
      })),
      showMarkup: false,
      revealTakenOut: true,
    }
  }

  const ops = lineOps(beforeLines, afterLines)
  const display: DisplayLine[] = []
  let changeCount = 0

  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    const next = ops[index + 1]
    if (op?.type === "same") {
      display.push({
        changed: false,
        pieces: [{ kind: "stayed", text: op.value }],
      })
      continue
    }
    if (op?.type === "removed" && next?.type === "added") {
      changeCount += 1
      if (overlapRatio(op.value, next.value) < 0.5) {
        display.push({
          changed: true,
          pieces: [{ kind: "removed", text: op.value }],
        })
        display.push({
          changed: true,
          pieces: [{ kind: "added", text: next.value }],
        })
      } else {
        display.push({
          changed: true,
          pieces: inlinePieces(op.value, next.value),
        })
      }
      index += 1
      continue
    }
    if (op?.type === "removed") {
      changeCount += 1
      display.push({
        changed: true,
        pieces: [{ kind: "removed", text: op.value }],
      })
      continue
    }
    if (op?.type === "added") {
      changeCount += 1
      display.push({
        changed: true,
        pieces: [{ kind: "added", text: op.value }],
      })
    }
  }

  return {
    headline: headlineFor(changeCount),
    changeCount,
    segments: foldLines(display),
    showMarkup: true,
    revealTakenOut: false,
  }
}
