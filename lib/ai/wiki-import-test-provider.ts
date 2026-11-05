import type { WikiImportAiOutput } from "@/lib/wiki-import"

/**
 * Local automated tests need a stable import result when no live model key is
 * present. This is refused in production and against any non-local Supabase
 * URL, and it does not change signature checks or database permissions.
 */
export function deterministicWikiImportAllowed() {
  if (process.env.NODE_ENV === "production") return false
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
