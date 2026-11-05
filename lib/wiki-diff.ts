export type WikiDiffKind = "stayed" | "removed" | "added"

export interface WikiDiffPiece {
  kind: WikiDiffKind
  text: string
}

export interface WikiPlainDiff {
  beforePieces: WikiDiffPiece[]
  afterPieces: WikiDiffPiece[]
  removed: string[]
  added: string[]
  stayed: string[]
  summary: string
}

interface LineOp {
  type: "same" | "removed" | "added"
  value: string
}

const MAX_LINE_CELLS = 400_000

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
  if (previous?.kind === kind && previous.text !== "\n" && text !== "\n") {
    previous.text = `${previous.text} ${text}`
    return
  }
  pieces.push({ kind, text })
}

function pushWordDiff(
  beforeLine: string,
  afterLine: string,
  beforePieces: WikiDiffPiece[],
  afterPieces: WikiDiffPiece[],
  removed: string[],
  added: string[]
) {
  const beforeWords = wordsOf(beforeLine)
  const afterWords = wordsOf(afterLine)
  const ops = lineOps(beforeWords, afterWords)
  const removedWords: string[] = []
  const addedWords: string[] = []

  for (const op of ops) {
    if (op.type === "same") {
      pushPiece(beforePieces, "stayed", op.value)
      pushPiece(afterPieces, "stayed", op.value)
    } else if (op.type === "removed") {
      pushPiece(beforePieces, "removed", op.value)
      removedWords.push(op.value)
    } else {
      pushPiece(afterPieces, "added", op.value)
      addedWords.push(op.value)
    }
  }

  if (removedWords.length) removed.push(removedWords.join(" "))
  if (addedWords.length) added.push(addedWords.join(" "))
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function summarizeWikiDiff({
  beforeText,
  afterText,
  removed,
  added,
  stayed,
}: {
  beforeText: string
  afterText: string
  removed: number
  added: number
  stayed: number
}) {
  if (!beforeText.trim() && !afterText.trim()) {
    return "Both versions are empty."
  }
  if (!beforeText.trim()) {
    return "This version is empty right now. Everything below will be added."
  }
  if (!afterText.trim()) {
    return "Everything below will be removed. The result is empty."
  }
  if (removed === 0 && added === 0) {
    return "Nothing changed. These two versions use the same words."
  }

  const sentences = [
    removed === 0
      ? "Nothing was removed."
      : `${countLabel(removed, "part was", "parts were")} removed.`,
    added === 0
      ? "Nothing was added."
      : `${countLabel(added, "part was", "parts were")} added.`,
    stayed === 0
      ? "Nothing stayed the same."
      : `${countLabel(stayed, "part", "parts")} stayed the same.`,
  ]
  return sentences.join(" ")
}

export function buildWikiPlainDiff(
  beforeText: string,
  afterText: string
): WikiPlainDiff {
  const beforeLines = splitLines(beforeText)
  const afterLines = splitLines(afterText)
  const ops = lineOps(beforeLines, afterLines)
  const beforePieces: WikiDiffPiece[] = []
  const afterPieces: WikiDiffPiece[] = []
  const removed: string[] = []
  const added: string[] = []
  const stayed: string[] = []

  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    const next = ops[index + 1]
    const writesBefore = op.type === "same" || op.type === "removed"
    const writesAfter =
      op.type === "same" ||
      op.type === "added" ||
      (op.type === "removed" && next?.type === "added")
    if (writesBefore && beforePieces.length) {
      beforePieces.push({ kind: "stayed", text: "\n" })
    }
    if (writesAfter && afterPieces.length) {
      afterPieces.push({ kind: "stayed", text: "\n" })
    }

    if (op.type === "same") {
      pushPiece(beforePieces, "stayed", op.value)
      pushPiece(afterPieces, "stayed", op.value)
      stayed.push(op.value)
      continue
    }

    if (op.type === "removed" && next?.type === "added") {
      pushWordDiff(
        op.value,
        next.value,
        beforePieces,
        afterPieces,
        removed,
        added
      )
      index += 1
      continue
    }

    if (op.type === "removed") {
      pushPiece(beforePieces, "removed", op.value)
      removed.push(op.value)
      continue
    }

    pushPiece(afterPieces, "added", op.value)
    added.push(op.value)
  }

  return {
    beforePieces,
    afterPieces,
    removed,
    added,
    stayed,
    summary: summarizeWikiDiff({
      beforeText,
      afterText,
      removed: removed.length,
      added: added.length,
      stayed: stayed.length,
    }),
  }
}
