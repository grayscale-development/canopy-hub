import { z } from "zod"

const id = z.string().min(1).max(200)
const text = z.string().min(1).max(20000)

export const miloCardSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("page-candidates"),
    id,
    title: text,
    candidates: z
      .array(
        z.object({
          id,
          title: text,
          breadcrumb: z.string().max(1000).optional(),
          updatedAt: z.string().optional(),
          snippet: z.string().max(300).optional(),
          confidence: z.enum(["High", "Possible"]).optional(),
          url: z
            .string()
            .regex(/^\/wiki\/\d+(?:\/\d+)*$/)
            .optional(),
        })
      )
      .max(3),
    current: z.number().int().nonnegative().max(2).optional(),
    outcome: z.enum(["confirmed", "create"]).optional(),
  }),
  z.object({
    type: z.literal("proposed-edit"),
    id,
    pageTitle: text,
    before: z.string(),
    after: z.string(),
    pageId: id.optional(),
    baseRevisionId: z.string().nullable().optional(),
    beforeBlocks: z.unknown().optional(),
    blocks: z.array(z.record(z.string(), z.unknown())).optional(),
    plain_text: z.string().optional(),
    changeNote: z.string().optional(),
    summary: z.string().optional(),
    notAdded: z.array(z.string()).optional(),
    nonTextNotes: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("applied-edit"),
    id,
    pageTitle: text,
    url: z
      .string()
      .regex(/^\/wiki\/\d+(?:\/\d+)*$/)
      .optional(),
    summary: z.string().max(20000).optional(),
    undoAvailable: z.boolean().optional(),
    undone: z.boolean().optional(),
  }),
  z.object({ type: z.literal("error"), id, message: text }),
])

export type MiloCard = z.infer<typeof miloCardSchema>
export type MiloStreamEvent =
  | { type: "meta"; threadId: string }
  | { type: "token"; token: string }
  | { type: "card"; messageId: string; card: MiloCard }
  | {
      type: "done"
      threadId: string
      userMessageId?: string
      assistantMessageId?: string | null
      citations: Array<{
        title: string
        url: string | null
        snippet: string
        updatedAt?: string
        updatedBy?: string
      }>
      abstained?: boolean
    }

// This JSON schema is the wire contract for known card payloads.
export const miloCardJsonSchema = z.toJSONSchema(miloCardSchema)

export const cardEventSchema = z.object({
  type: z.literal("card"),
  messageId: id,
  card: z.unknown(),
})

const knownCardEventSchema = cardEventSchema.extend({ card: miloCardSchema })

export type DisplayCard = MiloCard | { type: "unknown"; text: string }

export function displayCard(value: unknown): DisplayCard {
  const parsed = miloCardSchema.safeParse(value)
  if (parsed.success) return parsed.data

  if (
    value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "unknown" &&
    "text" in value &&
    typeof value.text === "string"
  ) {
    return { type: "unknown", text: value.text }
  }

  // React renders this as text, never HTML or an actionable card.
  return { type: "unknown", text: JSON.stringify(value) ?? "Unknown card" }
}

export function cardsFromMetadata(metadata: unknown): DisplayCard[] {
  if (!metadata || typeof metadata !== "object" || !("cards" in metadata))
    return []
  return Array.isArray(metadata.cards) ? metadata.cards.map(displayCard) : []
}

export function cardEvents(messageId: string, cards: MiloCard[]) {
  return z
    .array(miloCardSchema)
    .parse(cards)
    .map((card) =>
      knownCardEventSchema.parse({ type: "card", messageId, card })
    )
}

export const cardActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("select-page"),
    threadId: id,
    messageId: id,
    cardId: id,
    candidateId: id,
  }),
  z.object({
    action: z.enum(["next-page", "create-page"]),
    threadId: id,
    messageId: id,
    cardId: id,
  }),
  z.object({
    action: z.enum(["approve", "regenerate"]),
    threadId: id,
    messageId: id,
    cardId: id,
  }),
  z.object({
    action: z.literal("undo"),
    threadId: id,
    messageId: id,
    cardId: id,
  }),
])
