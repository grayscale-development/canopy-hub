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

export async function createEmbeddingsWithOpenAI(texts: string[]) {
  if (!texts.length) {
    return []
  }

  const client = getOpenAIClient()
  const { model, dimensions } = getEmbeddingConfig()
  const response = await client.embeddings.create({
    model,
    input: texts,
    dimensions,
  })

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

export async function createAgentResponseWithOpenAI(
  params: ResponseCreateParamsNonStreaming,
  options?: AgentResponseRequestOptions
) {
  const client = getOpenAIClient()
  return client.responses.create(params, options)
}
