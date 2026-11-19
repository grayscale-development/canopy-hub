import { wikiHeadingAnchor } from "@/lib/wiki-heading-anchor"
import { inlineCitations } from "@/lib/milo/inline-citations"

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

function referenceNames(source: Evidence) {
  const tag = /^Tag: (.+) \((.+)\)$/.exec(source.title)
  return tag ? [source.title, tag[1], tag[2]] : [source.title]
}

function mentionsReference(sentence: string, source: Evidence) {
  if (!source.url) return false
  const path = source.url.split("#")[0]
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  if (new RegExp(`${escape(path)}(?![\\p{L}\\p{N}/])`, "iu").test(sentence))
    return true
  const isNavigation =
    /(?:^\s*[-*]\s+|\b(?:see|open|visit|read|find|match|page|link|tag|section)\b|\*\*|\[)/i.test(
      sentence
    )
  const tag = /^Tag: (.+) \((.+)\)$/.exec(source.title)
  return referenceNames(source).some((name) => {
    if (!(isNavigation || (tag && name === tag[1]))) return false
    if (name.length < 3 && !(tag && name === tag[1])) return false
    return new RegExp(
      `(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`,
      "iu"
    ).test(sentence)
  })
}

export function checkAnswer(
  answer: string,
  sources: Evidence[],
  referenceSources: Evidence[] = sources
) {
  const citations: Evidence[] = []
  let unsupported = false
  function addCitation(source: Evidence, snippet: string) {
    const url = sourceUrl(source)
    let index = citations.findIndex(
      (item) => item.url === url && item.snippet === snippet
    )
    if (index < 0) {
      index = citations.length
      citations.push({ ...source, url, snippet })
    }
    return index + 1
  }
  const checked = answer
    .replace(
      /(?:^|\n\n?|(?<=[.!?])\s+)(?:(?:If you(?:'d like| want),?\s+I can)|Let me know if you(?:'d like| want)|I can also)\b[^\n]*/gi,
      ""
    )
    .split(/((?<=[.!?]) +(?=[A-Z])|\n)/)
    .map((sentence, part) => {
      if (part % 2) return sentence
      const claim = sentence.replace(/ *\[\d+\]/g, "")
      const match = sources
        .map((source) => ({ source, quote: quoteFor(claim, source) }))
        .find(({ quote }) => quote)
      const references = referenceSources
        .filter((source) => mentionsReference(claim, source))
        .sort(
          (a, b) =>
            Number(Boolean(b.knowledgeSourceId)) -
            Number(Boolean(a.knowledgeSourceId))
        )
      const referencedUrls = new Set<string | null>()
      if (match) {
        const index = addCitation(match.source, match.quote)
        referencedUrls.add(sourceUrl(match.source))
        for (const reference of references) {
          const url = sourceUrl(reference)
          if (!referencedUrls.has(url))
            addCitation(reference, reference.snippet)
          referencedUrls.add(url)
        }
        return `${claim.trimEnd()} [${index}]`
      }
      for (const reference of references) {
        const url = sourceUrl(reference)
        if (!referencedUrls.has(url)) addCitation(reference, reference.snippet)
        referencedUrls.add(url)
      }
      const heading =
        /^\s{0,3}#{1,6}\s/.test(claim) ||
        /^\s*\*\*[^*]+\*\*\s*:?\s*$/.test(claim) ||
        /^\s*(?:here (?:are|is) (?:the|some) (?:details|results|pages|tags|steps|information)|the following (?:pages|tags|steps|results)|the results)\s*:?\s*$/i.test(
          claim
        ) ||
        /\?\s*$/.test(claim)
      if (!references.length && !heading && terms(claim).length)
        unsupported = true
      return claim
    })
    .join("")
  return {
    answer: inlineCitations(
      unsupported
        ? `${checked}\n\nSome details could not be verified in the wiki.`
        : checked,
      citations
    ).replace(
      /\[([^\]\n]+)\]\(([^\s)]+)\)/g,
      (link, label: string, url: string) =>
        citations.some(
          (citation) =>
            citation.url === url || citation.url?.split("#")[0] === url
        )
          ? link
          : label
    ),
    citations,
  }
}
