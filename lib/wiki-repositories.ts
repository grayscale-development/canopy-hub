export const WIKI_REPOSITORIES = [
  { title: "Canopy Mortgage", slug: "canopy-mortgage", sortOrder: 0 },
  { title: "Nano LOS", slug: "nano-los", sortOrder: 1 },
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
