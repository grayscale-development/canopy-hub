export type WikiAlertRecommendationV1 = {
  version: 1
  summary: string
  targetPageId: string
  baseRevisionId: string
  canonicalPageId: string
  canonicalTitle: string
  canonicalPath: string
  blockId: string
  changeNote: string
}

export function parseWikiAlertRecommendation(
  value: unknown,
  pageId: string,
  otherPageId: string
): WikiAlertRecommendationV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const keys = [
    "summary",
    "targetPageId",
    "baseRevisionId",
    "canonicalPageId",
    "canonicalTitle",
    "canonicalPath",
    "blockId",
    "changeNote",
  ] as const
  if (
    item.version !== 1 ||
    Object.keys(item).length !== keys.length + 1 ||
    keys.some(
      (key) => typeof item[key] !== "string" || !(item[key] as string).trim()
    ) ||
    typeof item.canonicalPath !== "string" ||
    !/^\/wiki\/[1-9]\d*(?:\/[1-9]\d*)*$/.test(item.canonicalPath) ||
    ![pageId, otherPageId].includes(item.targetPageId as string) ||
    ![pageId, otherPageId].includes(item.canonicalPageId as string) ||
    item.targetPageId === item.canonicalPageId
  )
    return null
  return item as WikiAlertRecommendationV1
}
