import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name)
    return entry.isDirectory()
      ? files(name)
      : name.endsWith(".tsx")
        ? [name]
        : []
  })
}

function checkNestedLandmarks(file: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const problems: string[] = []
  function visit(node: ts.Node, inMain: boolean) {
    if (ts.isJsxElement(node)) {
      const name = node.openingElement.tagName.getText(source)
      const isMain = name === "main" || name === "SidebarInset"
      if (inMain && isMain) problems.push(`${file}: nested ${name}`)
      ts.forEachChild(node, (child) => visit(child, inMain || isMain))
      return
    }
    ts.forEachChild(node, (child) => visit(child, inMain))
  }
  visit(source, false)
  return problems
}

describe("page landmarks", () => {
  it("does not nest main elements inside main or SidebarInset in app files", () => {
    expect(files("app").flatMap(checkNestedLandmarks)).toEqual([])
  })

  it("keeps the wiki layout as the sole landmark across its page states", () => {
    for (const file of [
      "app/wiki/[[...path]]/page.tsx",
      "app/wiki/loading.tsx",
      "app/wiki/not-found.tsx",
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/<main(?:\s|>)/)
    }
    expect(readFileSync("app/wiki/layout.tsx", "utf8")).toContain(
      "<SidebarInset"
    )
  })

  it("gives the root and login loading pages a main landmark", () => {
    for (const file of ["app/page.tsx", "app/login/loading.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toMatch(/<main(?:\s|>)/)
    }
  })
})
