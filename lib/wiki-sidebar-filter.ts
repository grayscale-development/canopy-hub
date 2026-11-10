import type { WikiNodeRow } from "@/lib/wiki"

export function normalizeSidebarText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

export function sidebarQueryWords(query: string) {
  return normalizeSidebarText(query).trim().split(/\s+/).filter(Boolean)
}

export function filterWikiSidebar(nodes: WikiNodeRow[], query: string) {
  const words = sidebarQueryWords(query)
  const matchIds = new Set<string>()
  const visibleIds = new Set<string>()
  if (!words.length) {
    for (const node of nodes) visibleIds.add(node.id)
    return { matchIds, visibleIds }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string, WikiNodeRow[]>()
  for (const node of nodes) {
    if (node.parent_id) {
      const siblings = children.get(node.parent_id) ?? []
      siblings.push(node)
      children.set(node.parent_id, siblings)
    }
    const title = normalizeSidebarText(node.title)
    if (words.every((word) => title.includes(word))) matchIds.add(node.id)
  }

  for (const id of matchIds) {
    let node = byId.get(id)
    while (node && !visibleIds.has(node.id)) {
      visibleIds.add(node.id)
      node = node.parent_id ? byId.get(node.parent_id) : undefined
    }
  }

  const pending = [...matchIds].filter((id) => byId.get(id)?.type === "folder")
  const visited = new Set<string>()
  for (let index = 0; index < pending.length; index++) {
    if (visited.has(pending[index])) continue
    visited.add(pending[index])
    for (const child of children.get(pending[index]) ?? []) {
      visibleIds.add(child.id)
      if (child.type === "folder") pending.push(child.id)
    }
  }
  return { matchIds, visibleIds }
}

// Map normalized matches back to the original title, including combining marks.
export function sidebarHighlightRanges(title: string, query: string) {
  const words = sidebarQueryWords(query)
  let normalized = ""
  const offsets: Array<{ start: number; end: number }> = []
  let position = 0
  for (const character of title) {
    const start = position
    position += character.length
    const part = normalizeSidebarText(character)
    if (!part && offsets.length) offsets[offsets.length - 1].end = position
    for (let index = 0; index < part.length; index++) {
      offsets.push({ start, end: position })
    }
    normalized += part
  }

  const ranges: Array<{ start: number; end: number }> = []
  for (const word of words) {
    let index = normalized.indexOf(word)
    while (index !== -1) {
      ranges.push({
        start: offsets[index].start,
        end: offsets[index + word.length - 1].end,
      })
      index = normalized.indexOf(word, index + 1)
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  return ranges.reduce<typeof ranges>((merged, range) => {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end)
      last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
    return merged
  }, [])
}
