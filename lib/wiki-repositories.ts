export const WIKI_REPOSITORIES = [
  {
    title: "Canopy Wiki",
    slug: "canopy-wiki",
    sortOrder: 0,
  },
  {
    title: "Learning Hub",
    slug: "learning-hub",
    sortOrder: 1,
  },
  {
    title: "Nano Wiki",
    slug: "nano-wiki",
    sortOrder: 2,
  },
] as const

export type WikiRepositorySlug = (typeof WIKI_REPOSITORIES)[number]["slug"]

// The short-ID migration assigns existing area roots in sort order.
export const WIKI_AREA_SLUGS_BY_SHORT_ID: Readonly<
  Record<number, WikiRepositorySlug>
> = {
  1: "canopy-wiki",
  2: "learning-hub",
  3: "nano-wiki",
}

export function getWikiRepositoryBySlug(slug?: string | null) {
  return (
    WIKI_REPOSITORIES.find((repository) => repository.slug === slug) ?? null
  )
}

export function getWikiRepositoryByShortId(shortId: number) {
  return getWikiRepositoryBySlug(WIKI_AREA_SLUGS_BY_SHORT_ID[shortId])
}

export function getDefaultWikiRepository() {
  return WIKI_REPOSITORIES[0]
}
