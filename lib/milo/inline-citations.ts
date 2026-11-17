type Citation = { title: string; url: string | null }

export const INLINE_CITATION_INSTRUCTIONS =
  "Cite a source inline by linking its page or source name in the sentence using a markdown link with the URL from context. Never use numbered citation markers like [1]. When a title is available, never show a raw or backtick-formatted path or write a title followed by a path. Do not invent source names or URLs."

const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const safeUrl = (url: string | null): url is string =>
  Boolean(url && /^(?:\/(?!\/)|https?:\/\/)/i.test(url))

// Older answers and model output can contain paths and numbered citations.
export function inlineCitations(answer: string, citations: Citation[]) {
  const references = citations.filter(
    (citation) => citation.title.trim() && safeUrl(citation.url)
  ) as Array<{ title: string; url: string }>
  const links = answer.split(/(\[[^\]\n]+\]\([^\s)]+\))/g)
  const normalized = links
    .map((part, index) => {
      if (index % 2) {
        const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)!
        if (/^\d+$/.test(match[1])) return `[${match[1]}]`
        const label = match[1].replace(/\*\*|`/g, "").trim()
        const namedPath = /^(.+?):\s*(\/wiki(?:\/\d+)+)$/.exec(label)
        if (namedPath && namedPath[2] === match[2])
          return `[${namedPath[1]}](${match[2]})`
        const reference = references.find(
          ({ url }) => url === match[2] || url.split("#")[0] === match[2]
        )
        if (!reference) return part
        if (label === match[2] || label === `${reference.title}: ${match[2]}`)
          return `[${reference.title}](${match[2]})`
        return part
      }
      for (const { title, url } of references) {
        const path = url.split("#")[0]
        if (!/^\/wiki(?:\/\d+)*$/.test(path)) continue
        const titlePattern = escapePattern(title)
        const pathPattern = escapePattern(path)
        part = part.replace(
          new RegExp(
            `\\*\\*${titlePattern}\\s*:\\s*\`?${pathPattern}\`?\\*\\*`,
            "giu"
          ),
          () => `[${title}](${url})`
        )
        part = part.replace(
          new RegExp(
            `(?:\\*\\*)?${titlePattern}(?:\\*\\*)?\\s*:\\s*\`?${pathPattern}\`?(?![\\p{L}\\p{N}/])`,
            "giu"
          ),
          () => `[${title}](${url})`
        )
        // Avoid matching destinations of links created above.
        part = part.replace(
          new RegExp(
            `(?<![\\w/([])\`?${pathPattern}\`?(?![\\p{L}\\p{N}/])`,
            "gu"
          ),
          () => `[${title}](${url})`
        )
      }
      return part
    })
    .join("")

  return normalized
    .split(/((?<=[.!?])\s+(?=[A-Z])|(?<=\])\s+(?=[A-Z])|\n)/u)
    .map((sentence) => {
      const markers = [...sentence.matchAll(/\s*\[(\d+)\]/g)]
      const citation =
        markers.length === 1 ? citations[Number(markers[0][1]) - 1] : undefined
      const alreadyNamed = references.some(({ title }) =>
        new RegExp(
          `(?<![\\p{L}\\p{N}])${escapePattern(title)}(?![\\p{L}\\p{N}])`,
          "iu"
        ).test(sentence)
      )
      let result = sentence.replace(/\s*\[\d+\]/g, "")
      if (
        citation &&
        safeUrl(citation.url) &&
        citation.title.trim() &&
        !alreadyNamed
      ) {
        const link = `[${citation.title}](${citation.url})`
        result = result.replace(/([.!?])?$/, ` ${link}$1`)
      }
      return result
    })
    .join("")
}
