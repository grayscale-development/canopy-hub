import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8")
}

function staticImportSources(src: string) {
  return [...src.matchAll(/^import[\s\S]*?from\s+["']([^"']+)["']/gm)].map(
    (match) => match[1]
  )
}

describe("Milo chat jsdom isolation", () => {
  it("does not statically import jsdom or wiki-import on the chat route", () => {
    const src = source("app/api/wiki/chat/route.ts")
    expect(staticImportSources(src)).not.toEqual(
      expect.arrayContaining([
        "jsdom",
        "@/lib/wiki-import",
        "@/lib/milo/proposed-edit",
        "@/lib/ai/wiki-import-pipeline",
      ])
    )
    expect(src).toMatch(/import\(\s*["']@\/lib\/milo\/proposed-edit["']/)
  })

  it("loads wiki-import only inside prepareMiloProposal", () => {
    const src = source("lib/milo/proposed-edit.ts")
    expect(staticImportSources(src)).not.toEqual(
      expect.arrayContaining([
        "jsdom",
        "@/lib/wiki-import",
        "@/lib/ai/wiki-import-pipeline",
      ])
    )
    expect(src).toContain('import("@/lib/wiki-import")')
    expect(src).toContain('import("@/lib/ai/wiki-import-pipeline")')
  })
})
