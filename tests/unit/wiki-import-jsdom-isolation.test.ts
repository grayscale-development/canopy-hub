import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const root = resolve(__dirname, "../..")

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8")
}

function staticImportSources(src: string) {
  return [
    ...src.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gm),
  ].map((match) => match[1])
}

afterEach(() => {
  vi.doUnmock("@/lib/wiki-import")
  vi.doUnmock("@/lib/ai/wiki-import-pipeline")
  vi.doUnmock("node:module")
  vi.resetModules()
})

describe("Wiki import jsdom isolation", () => {
  it("loads the route without evaluating wiki-import or its pipeline", async () => {
    vi.resetModules()
    vi.doMock("@/lib/wiki-import", () => {
      throw new Error("wiki-import evaluated")
    })
    vi.doMock("@/lib/ai/wiki-import-pipeline", () => {
      throw new Error("wiki-import pipeline evaluated")
    })

    const route = await import("@/app/api/wiki/import/route")
    expect(route.POST).toBeTypeOf("function")
  })

  it("loads wiki-import and its pipeline inside both request paths", () => {
    const src = source("app/api/wiki/import/route.ts")
    expect(staticImportSources(src)).not.toEqual(
      expect.arrayContaining([
        "jsdom",
        "@/lib/wiki-import",
        "@/lib/ai/wiki-import-pipeline",
      ])
    )
    const video = src.slice(
      src.indexOf("async function completeWikiVideoImport"),
      src.indexOf("function isRecord")
    )
    const post = src.slice(src.indexOf("export async function POST"))
    for (const path of [video, post]) {
      expect(path).toContain('import("@/lib/wiki-import")')
      expect(path).toContain('import("@/lib/ai/wiki-import-pipeline")')
    }
  })

  it("loads jsdom only when a DOCX document is parsed", async () => {
    vi.resetModules()
    const loadJsdom = vi.fn(() => {
      throw new Error("jsdom loaded")
    })
    vi.doMock("node:module", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:module")>()),
      createRequire: () => loadJsdom,
    }))

    const wikiImport = await import("@/lib/wiki-import")
    expect(wikiImport.normalizeWikiImportText("  Example  ")).toBe("Example")
    expect(loadJsdom).not.toHaveBeenCalled()
    expect(() =>
      wikiImport.docxHtmlToWikiImportBlocks({ html: "<p>Example</p>" })
    ).toThrow("jsdom loaded")
    expect(() =>
      wikiImport.createWikiDocxImportDraft({
        html: "<p>Example</p>",
        text: "Example",
        fileName: "example.docx",
        imageUrls: new Map(),
      })
    ).toThrow("jsdom loaded")
    expect(loadJsdom).toHaveBeenCalledTimes(2)
    expect(loadJsdom).toHaveBeenCalledWith("jsdom")
  })
})
