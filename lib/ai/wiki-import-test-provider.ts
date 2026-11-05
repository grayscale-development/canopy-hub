import type { WikiImportAiOutput } from "@/lib/wiki-import"

/**
 * Local automated tests need a stable import result when no live model key is
 * present. The local Supabase URL is the boundary: a hosted project cannot
 * turn this on, including when `next start` sets NODE_ENV to production.
 * Signature checks and database permissions are unchanged.
 */
export function deterministicWikiImportAllowed() {
  if (process.env.WIKI_IMPORT_TEST_PROVIDER !== "deterministic") return false
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  return /^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)
}

export function deterministicWikiImportOutput(
  text: string,
  fileName: string
): WikiImportAiOutput {
  const titleSource =
    fileName && fileName !== "Pasted text"
      ? fileName.replace(/\.[^.]+$/, "")
      : "Reviewed page"
  return {
    title:
      titleSource.replace(/\s+/g, " ").trim().slice(0, 80) || "Reviewed page",
    tags: [],
    markdown: text,
  }
}
