// The same heading path is used by indexing and by the rendered wiki page.
export function wikiHeadingAnchor(path: string[]) {
  return path
    .join(" ")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}
