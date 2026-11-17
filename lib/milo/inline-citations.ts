type Citation = { title: string; url: string | null }

export const INLINE_CITATION_INSTRUCTIONS =
  "Cite each page once, naturally at its first mention, using a markdown link such as per the [Funding Checklist](/wiki/1/16/17) with the URL from context. Never repeat a page link or use numbered citation markers like [1]. Never append a bare page name or path to a sentence as a citation. When a title is available, never show a raw or backtick-formatted path or write a title followed by a path. Do not invent source names or URLs."

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

  const names = references
    .flatMap(({ title, url }) => {
      const tag = /^Tag: (.+) \((.+)\)$/.exec(title)
      return [title, ...(tag ? [tag[1]] : [])]
        .filter((name) => name.length >= 3)
        .map((name) => ({ name, url }))
    })
    .sort((a, b) => b.name.length - a.name.length)
  const titlePattern = names.map(({ name }) => escapePattern(name)).join("|")
  const tokens = new RegExp(
    `\\[[^\\]\\n]+\\]\\([^\\s)]+\\)|\`[^\`\\n]+\`${
      titlePattern
        ? `|(?<![\\p{L}\\p{N}])(?:${titlePattern})(?![\\p{L}\\p{N}])`
        : ""
    }`,
    "giu"
  )
  const linked = new Set<string>()

  return normalized.replace(/[ \t]*\[\d+\]/g, "").replace(tokens, (token) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
    if (link) {
      const reference = references.find(
        ({ url }) => url === link[2] || url.split("#")[0] === link[2]
      )
      if (!reference && !/^\/wiki(?:\/\d+)+$/.test(link[2])) return token
      if (linked.has(link[2])) return link[1]
      linked.add(link[2])
      return token
    }
    if (token.startsWith("`")) return token
    const reference = names.find(
      ({ name }) => name.toLocaleLowerCase() === token.toLocaleLowerCase()
    )!
    if (linked.has(reference.url)) return token
    linked.add(reference.url)
    return `[${token}](${reference.url})`
  })
}
