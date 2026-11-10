import { z } from "zod"

const id = z.string().min(1).max(200)
const text = z.string().min(1).max(20000)

export const miloCardSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("page-candidates"),
    id,
    title: text,
    candidates: z
      .array(z.object({ id, title: text }))
      .min(1)
      .max(20),
  }),
  z.object({
    type: z.literal("proposed-edit"),
    id,
    pageTitle: text,
    before: z.string().max(20000),
    after: z.string().max(20000),
  }),
  z.object({ type: z.literal("applied-edit"), id, pageTitle: text }),
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
      citations: Array<{ title: string; url: string | null; snippet: string }>
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
    action: z.literal("approve"),
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
