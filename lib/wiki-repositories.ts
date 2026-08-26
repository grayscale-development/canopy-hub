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

export function getWikiRepositoryBySlug(slug?: string | null) {
  return (
    WIKI_REPOSITORIES.find((repository) => repository.slug === slug) ?? null
  )
}

export function getDefaultWikiRepository() {
  return WIKI_REPOSITORIES[0]
}
