import "server-only"

import OpenAI from "openai"
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses"

interface AgentResponseRequestOptions {
  signal?: AbortSignal | null
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.")
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function getEmbeddingConfig() {
  const dimensions = Number.parseInt(
    process.env.OPENAI_EMBEDDING_DIMENSIONS ?? "1536",
    10
  )

  return {
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    dimensions: Number.isFinite(dimensions) ? dimensions : 1536,
  }
}

export function getChatModel() {
  const model = process.env.OPENAI_CHAT_MODEL?.trim()
  if (!model) {
    throw new Error("Missing OPENAI_CHAT_MODEL.")
  }
  return model
}

export function getFormatModel() {
  return process.env.OPENAI_FORMAT_MODEL?.trim() || "gpt-5-nano"
}

/**
 * Imports need to preserve a document's layout, which is a materially harder
 * task than the short-format operations that use `OPENAI_FORMAT_MODEL`.
 * Prefer an import-specific override and otherwise use the configured chat
 * model so deployments can opt into a stronger formatter without changing
 * other features.
 */
export function getWikiImportModel() {
  return process.env.OPENAI_WIKI_IMPORT_MODEL?.trim() || getChatModel()
}

export function getTranscriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe"
}

export async function createEmbeddingsWithOpenAI(
  texts: string[],
  signal?: AbortSignal
) {
  if (!texts.length) {
    return []
  }

  const { model, dimensions } = getEmbeddingConfig()
  if (model === "fake-embedding") {
    return texts.map((text) => {
      const vector = Array<number>(dimensions).fill(0)
      for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        let hash = 0
        for (const character of word)
          hash = (hash * 31 + character.charCodeAt(0)) >>> 0
        vector[hash % dimensions] += 1
      }
      return vector
    })
  }
  const client = getOpenAIClient()
  const response = await client.embeddings.create(
    {
      model,
      input: texts,
      dimensions,
    },
    signal ? { signal, maxRetries: 0, timeout: 3000 } : undefined
  )

  return response.data.map((item) => item.embedding)
}

export async function createChatResponseWithOpenAI({
  model,
  input,
}: {
  model: string
  input: string
}) {
  const client = getOpenAIClient()
  return client.responses.create({ model, input })
}

export async function createTranscriptionWithOpenAI(file: File) {
  const client = getOpenAIClient()
  const response = await client.audio.transcriptions.create({
    file,
    model: getTranscriptionModel(),
  })

  return typeof response.text === "string" ? response.text.trim() : ""
}

export async function createAgentResponseWithOpenAI(
  params: ResponseCreateParamsNonStreaming,
  options?: AgentResponseRequestOptions
) {
  const client = getOpenAIClient()
  return client.responses.create(params, options)
}
