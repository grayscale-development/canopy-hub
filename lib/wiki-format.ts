export const WIKI_FORMAT_VERSION = 2

export type WikiFormatItemType =
  | "text"
  | "media"
  | "table"
  | "divider"
  | "empty"

export interface WikiFormatItem {
  type: WikiFormatItemType
  id: string
  markdown?: string
  blockType?: string
  name?: string
  caption?: string
}

export interface WikiFormatMediaPatch {
  caption?: string
  showPreview?: boolean
}

export type WikiFormatCalloutTone = "red" | "yellow" | "gray" | "blue" | "green"

export type WikiFormatOutputItem =
  | {
      type: "markdown"
      markdown: string
      sourceIds?: string[]
    }
  | {
      type: "callout"
      tone: WikiFormatCalloutTone
      markdown: string
      sourceIds?: string[]
    }
  | {
      type: "ref"
      id: string
      mediaPatch?: WikiFormatMediaPatch
    }
  | {
      type: "divider"
    }
  | {
      type: "spacer"
    }

export interface WikiFormatStats {
  changedTextGroups: number
  movedRichBlocks: number
  insertedCallouts: number
  insertedDividers: number
  insertedSpacers: number
  captionChanges: number
}

export interface WikiFormatResponse {
  summary: string
  items: WikiFormatOutputItem[]
  stats: WikiFormatStats
}
