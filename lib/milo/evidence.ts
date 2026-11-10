import { wikiHeadingAnchor } from "@/lib/wiki-heading-anchor"

const STOP = new Set(
  "a an and are as at be by can could do does for from how i in is it me of on or please should that the their this to was what when where which who will with would you your find tell about page wiki company".split(
    " "
  )
)
const terms = (text: string) => [
  ...new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (word) => word.length > 2 && !STOP.has(word)
    )
  ),
]

export type Evidence = {
  title: string
  url: string | null
  snippet: string
  sourceType?: string
  knowledgeSourceId?: string | null
  knowledgeChunkId?: string | null
  headingPath?: string[]
  updatedAt?: string
  updatedBy?: string
}

// Require at least half of the question's meaningful terms in one retrieved source.
export const RETRIEVAL_OVERLAP_THRESHOLD = 0.5
export function hasRetrievalConfidence(question: string, sources: Evidence[]) {
  const query = terms(question)
  if (!query.length && /\bwiki\b/i.test(question))
    return sources.some((source) =>
      /\bwiki\b/i.test(`${source.title} ${source.snippet}`)
    )
  if (!query.length) return false
  return sources.some((source) => {
    const text = new Set(terms(`${source.title} ${source.snippet}`))
    return (
      query.filter((word) => text.has(word)).length / query.length >=
      RETRIEVAL_OVERLAP_THRESHOLD
    )
  })
}

function quoteFor(paragraph: string, source: Evidence) {
  const body =
    source.headingPath?.length &&
    source.snippet.startsWith(source.headingPath.join(" > ") + "\n\n")
      ? source.snippet.slice(source.headingPath.join(" > ").length + 2)
      : source.snippet
  const lines = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const answerTerms = terms(paragraph.replace(/\[\d+\]/g, ""))
  let best = ""
  let score = 0
  for (const line of lines) {
    const lineTerms = new Set(terms(line))
    const overlap = answerTerms.filter((word) => lineTerms.has(word)).length
    const numbers =
      paragraph.replace(/\[\d+\]/g, "").match(/\b\d+(?:\.\d+)?\b/g) ?? []
    const negation = /\b(?:not|never|no|cannot|mustn.t|don.t)\b/i.test(
      paragraph
    )
    if (
      numbers.some((number) => !line.includes(number)) ||
      negation !== /\b(?:not|never|no|cannot|mustn.t|don.t)\b/i.test(line)
    )
      continue
    if (overlap > score) {
      best = line
      score = overlap
    }
  }
  return answerTerms.length && score / answerTerms.length >= 0.6 ? best : ""
}

export function sourceUrl(source: Evidence) {
  const anchor =
    source.sourceType === "wiki_page" && source.headingPath?.length
      ? wikiHeadingAnchor(source.headingPath)
      : ""
  return source.url && anchor
    ? `${source.url.split("#")[0]}#${anchor}`
    : source.url
}

export function checkAnswer(answer: string, sources: Evidence[]) {
  const citations: Evidence[] = []
  const paragraphs = answer.split(/\n\s*\n/).map((paragraph) =>
    paragraph
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((sentence) => {
        const claim = sentence.replace(/\s*\[\d+\]/g, "")
        const match = sources
          .map((source) => ({ source, quote: quoteFor(claim, source) }))
          .find(({ quote }) => quote)
        if (!match) return `${claim} (Not found in the wiki.)`
        const { source, quote } = match
        const url = sourceUrl(source)
        let index = citations.findIndex(
          (item) => item.url === url && item.snippet === quote
        )
        if (index < 0) {
          index = citations.length
          citations.push({ ...source, url, snippet: quote })
        }
        return `${claim} [${index + 1}]`
      })
      .join(" ")
  )
  return { answer: paragraphs.join("\n\n"), citations }
}
