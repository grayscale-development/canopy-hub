// Replace only the matched block's own content. Nested blocks are independent
// passages and must remain in the document.
export function replaceDuplicateBlock(
  blocks: unknown,
  blockId: string,
  title: string,
  path: string
): unknown[] | null {
  if (!Array.isArray(blocks)) return null
  let replaced = 0
  function visit(items: unknown[]): unknown[] {
    return items.map((item) => {
      if (!item || typeof item !== "object") return item
      const block = item as Record<string, unknown>
      const children = Array.isArray(block.children)
        ? visit(block.children)
        : block.children
      if (block.id === blockId) {
        replaced++
        return {
          id: block.id,
          type: "paragraph",
          content: [
            {
              type: "link",
              href: path,
              content: [{ type: "text", text: `See ${title}`, styles: {} }],
            },
          ],
          children: children ?? [],
        }
      }
      return Array.isArray(block.children) ? { ...block, children } : item
    })
  }
  const result = visit(blocks)
  return replaced === 1 ? result : null
}

export function duplicateBlockText(blocks: unknown, blockId: string): unknown {
  if (!Array.isArray(blocks)) return null
  for (const item of blocks) {
    if (!item || typeof item !== "object") continue
    const block = item as Record<string, unknown>
    if (block.id === blockId) return { ...block, children: [] }
    const child = duplicateBlockText(block.children, blockId)
    if (child) return child
  }
  return null
}
