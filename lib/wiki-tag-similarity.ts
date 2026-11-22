export type WikiTagSimilarityReason =
  | "same word"
  | "plural of"
  | "abbreviation of"
  | "similar spelling"

const ABBREVIATIONS: Record<string, string> = {
  lo: "loan officer",
  mi: "mortgage insurance",
  dpa: "down payment assistance",
  uw: "underwriting",
  aus: "automated underwriting system",
  le: "loan estimate",
  cd: "closing disclosure",
  dti: "debt to income",
  ltv: "loan to value",
  hoa: "homeowners association",
  comp: "compensation",
}

function words(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function singular(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.length > 4 && /(ches|shes|xes|zes)$/.test(word))
    return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1)
  return word
}

function distance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i)
  for (let i = 0; i < left.length; i++) {
    const current = [i + 1]
    for (let j = 0; j < right.length; j++) {
      current.push(
        Math.min(
          current[j] + 1,
          previous[j + 1] + 1,
          previous[j] + Number(left[i] !== right[j])
        )
      )
    }
    previous = current
  }
  return previous[right.length]
}

export function matchWikiTagName(
  name: string,
  candidate: string
): WikiTagSimilarityReason | null {
  const a = words(name)
  const b = words(candidate)
  if (!a.length || !b.length) return null
  if (a.join("") === b.join("")) return "same word"
  if (a.map(singular).join(" ") === b.map(singular).join(" "))
    return "plural of"
  const expand = (parts: string[]) =>
    parts
      .flatMap((part) => (ABBREVIATIONS[part] ?? part).split(" "))
      .map(singular)
      .join(" ")
  if (expand(a) === expand(b)) return "abbreviation of"
  const left = a.join("")
  const right = b.join("")
  const maxLength = Math.max(left.length, right.length)
  if (maxLength >= 5 && distance(left, right) <= (maxLength >= 10 ? 2 : 1))
    return "similar spelling"
  return null
}

export function findSimilarWikiTags<T extends { name: string }>(
  name: string,
  candidates: T[]
) {
  return candidates.flatMap((tag) => {
    const reason = matchWikiTagName(name, tag.name)
    return reason ? [{ tag, reason }] : []
  })
}

// Semantic candidates must be references from candidates, in similarity order.
export function rankWikiTags<T extends { name: string }>(
  query: string,
  candidates: T[],
  semantic: T[] = []
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const ranked = candidates.flatMap((tag) => {
    const name = tag.name.toLowerCase()
    let rank: number
    let reason: string | null = null
    if (name === needle) rank = 0
    else if (name.startsWith(needle)) rank = 1
    else if (words(tag.name).some((word) => word.startsWith(needle))) rank = 2
    else if (name.includes(needle)) rank = 3
    else {
      const match = matchWikiTagName(query, tag.name)
      if (!match) return []
      rank = 4
      reason =
        match === "abbreviation of"
          ? "abbreviation"
          : match === "similar spelling"
            ? "close spelling"
            : "similar word"
    }
    return [{ tag, rank, reason }]
  })
  ranked.sort((a, b) => a.rank - b.rank || a.tag.name.localeCompare(b.tag.name))
  const seen = new Set(ranked.map(({ tag }) => tag))
  for (const tag of semantic) {
    if (!seen.has(tag)) {
      ranked.push({ tag, rank: 5, reason: "similar meaning" })
      seen.add(tag)
    }
  }
  return ranked
}
