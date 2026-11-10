import "server-only"

import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
  Tool,
} from "openai/resources/responses/responses"

import type { createSupabaseServerClient } from "@/lib/supabase/server"

import { createAgentResponseWithOpenAI, getChatModel } from "@/lib/ai/provider"
import {
  checkAnswer,
  hasRetrievalConfidence,
  sourceUrl,
} from "@/lib/milo/evidence"
import {
  callMiloMcpTool,
  MILO_MCP_TOOLS,
  type MiloSourceCard,
} from "@/lib/milo/mcp/tools"
import {
  miloPermissionInstructions,
  type MiloUserContext,
} from "@/lib/milo/user-context"

export interface MiloAgentCitation {
  knowledgeSourceId: string | null
  knowledgeChunkId: string | null
  title: string
  url: string | null
  snippet: string
  updatedAt?: string
  updatedBy?: string
}

export interface MiloAgentAnswer {
  answer: string
  model: string
  citations: MiloAgentCitation[]
  metadata: {
    mode: "agentic_mcp"
    abstained?: boolean
    abstainReason?: string
    toolCalls: Array<{
      toolName: string
      ok: boolean
      error?: string
    }>
  }
}

const MAX_AGENT_STEPS = 5

const MILO_AGENT_INSTRUCTIONS = `You are Milo, Canopy Hub's internal assistant.

Use the available Milo MCP tools when the user asks about employees, branches, support contacts, documents, newsletters, reports, wiki content, dashboard/operational data, or where to find something in Canopy Hub.

Rules:
- Answer only from tool results, the initial research brief, or supplied conversation context.
- Treat the initial research brief as authoritative starting evidence. Use it before choosing extra tools.
- If the data is unavailable, say what is missing and where in Canopy Hub to check.
- For how-to, procedure, SOP, workflow, and step-by-step questions, prefer exact wiki_page or indexed knowledge matches over incidental branch, report, people, or generic document matches.
- If an exact title, slug, URL, or source-title match appears in the research brief, use that source first.
- Prefer db_search for person, branch, support, wiki, and document lookup questions.
- Prefer knowledge_search for policy, newsletter, wiki, and general Canopy Hub knowledge questions.
- Use wiki_tag_search when the user asks about a Wiki tag or pages assigned to a role, topic, or other tag.
- Prefer db_aggregate for counts, totals, averages, and grouped operational summaries.
- When the user asks what documents or files are available, call storage_list for Newsletters and Misc before answering. Do not answer from Wiki assets alone unless the user specifically asks about Wiki uploads.
- Prefer storage_signed_url when the user asks to open a document or file.
- Keep answers concise and include exact names, emails, phone numbers, routes, and signed URLs when tools provide them.
- Do not invent citations. Mention source names or links from tool output in the answer.
- You are read-only. Never claim to update, upload, delete, sync, or change data.`

const MCP_TOOL_DESCRIPTION = [
  "Call one read-only tool on Canopy Hub's internal Milo MCP server.",
  "Available tools:",
  ...MILO_MCP_TOOLS.map((tool) => `- ${tool.name}: ${tool.description}`),
].join("\n")

const MILO_MCP_PROXY_TOOL: Tool = {
  type: "function",
  name: "milo_mcp_call",
  description: MCP_TOOL_DESCRIPTION,
  strict: false,
  parameters: {
    type: "object",
    properties: {
      toolName: {
        type: "string",
        enum: MILO_MCP_TOOLS.map((tool) => tool.name),
      },
      arguments: {
        type: "object",
        description:
          "Arguments for the selected MCP tool. Use the selected tool's schema from the description.",
        additionalProperties: true,
      },
    },
    required: ["toolName", "arguments"],
    additionalProperties: false,
  },
}

type InitialResearchToolCall = {
  toolName: string
  arguments: Record<string, unknown>
  reason: string
}

type InitialResearchResult = {
  brief: string
  sources: MiloSourceCard[]
  toolCalls: MiloAgentAnswer["metadata"]["toolCalls"]
}

const MAX_RESEARCH_RESULT_CHARS = 2_800
const MAX_RESEARCH_BRIEF_CHARS = 14_000

const SEARCH_STOP_WORDS = new Set([
  "about",
  "available",
  "can",
  "could",
  "does",
  "give",
  "handles",
  "have",
  "how",
  "into",
  "list",
  "look",
  "looking",
  "open",
  "please",
  "show",
  "step",
  "steps",
  "tell",
  "that",
  "the",
  "this",
  "what",
  "where",
  "which",
  "who",
  "with",
  "you",
])

function getResponseFunctionCalls(
  response: unknown
): ResponseFunctionToolCall[] {
  const output =
    response && typeof response === "object" && "output" in response
      ? response.output
      : null

  if (!Array.isArray(output)) {
    return []
  }

  return output.filter(
    (item): item is ResponseFunctionToolCall =>
      item &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "function_call" &&
      "name" in item &&
      item.name === "milo_mcp_call"
  )
}

function getResponseOutputItems(response: unknown): ResponseInputItem[] {
  const output =
    response && typeof response === "object" && "output" in response
      ? response.output
      : null

  return Array.isArray(output) ? (output as ResponseInputItem[]) : []
}

function getResponseText(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text.trim()
  }

  return ""
}

function parseProxyArguments(value: string) {
  const parsed = JSON.parse(value) as {
    toolName?: unknown
    arguments?: unknown
  }

  return {
    toolName: typeof parsed.toolName === "string" ? parsed.toolName : "",
    arguments: parsed.arguments ?? {},
  }
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function compactJson(value: unknown, maxLength = MAX_RESEARCH_RESULT_CHARS) {
  return truncateText(JSON.stringify(value, null, 2), maxLength)
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function getFocusedSearchQuery(question: string) {
  const terms = normalizeSearchText(question)
    .split(" ")
    .map((term) => term.replace(/^'+|'+$/g, ""))
    .filter((term) => term.length > 2 && !SEARCH_STOP_WORDS.has(term))

  return [...new Set(terms)].slice(0, 8).join(" ")
}

function getSearchQueryVariants(query: string) {
  const normalized = normalizeSearchText(query)
  const expanded = normalized.replace(/\bauth\b/g, "authorization")

  return [...new Set([normalized, expanded].filter(Boolean))]
}

function isProcedureQuestion(question: string) {
  return /\b(cancel|create|delete|edit|fix|handle|how do i|how to|procedure|process|remove|request|step by step|steps|submit|update|workflow)\b/i.test(
    question
  )
}

function isDocumentQuestion(question: string) {
  return /\b(document|documents|file|files|handbook|newsletter|newsletters|policies|policy|pdf)\b/i.test(
    question
  )
}

function isAggregateQuestion(question: string) {
  return /\b(average|count|how many|max|min|sum|total|totals|trend|trends|by branch|by division|grouped by)\b/i.test(
    question
  )
}

function addUniqueResearchCall(
  calls: InitialResearchToolCall[],
  nextCall: InitialResearchToolCall
) {
  const key = `${nextCall.toolName}:${JSON.stringify(nextCall.arguments)}`
  const exists = calls.some(
    (call) => `${call.toolName}:${JSON.stringify(call.arguments)}` === key
  )

  if (!exists) {
    calls.push(nextCall)
  }
}

function buildInitialResearchCalls(
  question: string
): InitialResearchToolCall[] {
  const calls: InitialResearchToolCall[] = []
  const focusedQuery = getFocusedSearchQuery(question)
  const focusedQueryVariants = getSearchQueryVariants(focusedQuery)
  const procedureQuestion = isProcedureQuestion(question)
  const documentQuestion = isDocumentQuestion(question)

  for (const query of getSearchQueryVariants(question)) {
    addUniqueResearchCall(calls, {
      toolName: "knowledge_search",
      arguments: { query, limit: 8 },
      reason: "Search indexed Hub knowledge before answering.",
    })
  }

  for (const query of focusedQueryVariants) {
    addUniqueResearchCall(calls, {
      toolName: "wiki_tag_search",
      arguments: { query, limit: 8 },
      reason: "Check matching Wiki tags and their published pages.",
    })
  }

  if (focusedQuery && focusedQuery !== normalizeSearchText(question)) {
    addUniqueResearchCall(calls, {
      toolName: "knowledge_search",
      arguments: {
        query: focusedQuery,
        limit: 8,
        sourceTypes: procedureQuestion
          ? ["wiki_page", "wiki_asset", "document", "support", "site"]
          : undefined,
      },
      reason: "Search core nouns without conversational filler.",
    })
  }

  for (const query of focusedQueryVariants) {
    if (query === focusedQuery) {
      continue
    }
    addUniqueResearchCall(calls, {
      toolName: "knowledge_search",
      arguments: {
        query,
        limit: 8,
        sourceTypes: ["wiki_page", "wiki_asset", "document", "support", "site"],
      },
      reason: "Search expanded operational abbreviations.",
    })
  }

  addUniqueResearchCall(calls, {
    toolName: "db_search",
    arguments: { query: question, limit: 8 },
    reason:
      "Search directories, wiki metadata, support, and knowledge source titles.",
  })

  if (focusedQuery && !documentQuestion) {
    addUniqueResearchCall(calls, {
      toolName: "db_search",
      arguments: {
        query: focusedQuery,
        relation: "public.wiki_nodes",
        limit: 8,
      },
      reason: "Topic lookups should check wiki page titles and slugs.",
    })
    addUniqueResearchCall(calls, {
      toolName: "db_search",
      arguments: {
        query: focusedQuery,
        relation: "public.knowledge_sources",
        limit: 8,
      },
      reason: "Topic lookups should check indexed source titles and URLs.",
    })
  }

  for (const query of focusedQueryVariants) {
    if (documentQuestion) {
      continue
    }
    if (query === focusedQuery) {
      continue
    }
    addUniqueResearchCall(calls, {
      toolName: "db_search",
      arguments: {
        query,
        relation: "public.wiki_nodes",
        limit: 8,
      },
      reason: "Expanded abbreviations should check wiki page titles and slugs.",
    })
    addUniqueResearchCall(calls, {
      toolName: "db_search",
      arguments: {
        query,
        relation: "public.knowledge_sources",
        limit: 8,
      },
      reason:
        "Expanded abbreviations should check indexed source titles and URLs.",
    })
  }

  if (documentQuestion) {
    for (const bucket of ["Newsletters", "Misc"]) {
      addUniqueResearchCall(calls, {
        toolName: "storage_list",
        arguments: { bucket, limit: 50 },
        reason: `List available ${bucket} storage objects.`,
      })
    }
  }

  if (isAggregateQuestion(question)) {
    addUniqueResearchCall(calls, {
      toolName: "db_schema",
      arguments: {},
      reason: "Expose available data relations before choosing aggregates.",
    })
  }

  return calls.slice(0, 9)
}

function formatResearchResult({
  call,
  result,
}: {
  call: InitialResearchToolCall
  result: Awaited<ReturnType<typeof callMiloMcpTool>>
}) {
  const status = result.ok ? "ok" : `failed: ${result.error ?? "unknown error"}`
  return [
    `Tool: ${call.toolName}`,
    `Reason: ${call.reason}`,
    `Status: ${status}`,
    `Arguments: ${compactJson(call.arguments, 600)}`,
    result.ok ? `Result: ${compactJson(result.content)}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

function formatResearchSources(sources: MiloSourceCard[]) {
  const citations = toCitations(sources).slice(0, 8)
  if (!citations.length) {
    return "No source cards were returned by the initial tools."
  }

  return citations
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}\nURL: ${
          source.url ?? "No URL"
        }\nSnippet: ${source.snippet}`
    )
    .join("\n\n")
}

async function buildInitialResearchBrief(
  question: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<InitialResearchResult> {
  const calls = buildInitialResearchCalls(question)
  const sources: MiloSourceCard[] = []
  const toolCalls: MiloAgentAnswer["metadata"]["toolCalls"] = []
  const resultBlocks: string[] = []

  for (const call of calls) {
    const result = await callMiloMcpTool(
      call.toolName,
      call.arguments,
      supabase
    )
    toolCalls.push({
      toolName: result.toolName,
      ok: result.ok,
      error: result.error,
    })
    sources.push(...(result.sources ?? []))
    resultBlocks.push(formatResearchResult({ call, result }))
  }

  const brief = [
    "Initial Milo research brief",
    "Use this brief as starting evidence. If it contains a strong exact page/source match, answer from it before calling more tools.",
    "",
    "Source cards:",
    formatResearchSources(sources),
    "",
    "Tool results:",
    resultBlocks.join("\n\n---\n\n") || "No initial tool results.",
  ].join("\n")

  return {
    brief: truncateText(brief, MAX_RESEARCH_BRIEF_CHARS),
    sources,
    toolCalls,
  }
}

function toCitations(sources: MiloSourceCard[]): MiloAgentCitation[] {
  const seen = new Set<string>()
  const citations: MiloAgentCitation[] = []

  for (const source of sources) {
    const key = `${source.title}|${source.url}|${source.snippet}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    citations.push({
      knowledgeSourceId: source.knowledgeSourceId ?? null,
      knowledgeChunkId: source.knowledgeChunkId ?? null,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
      updatedAt: source.updatedAt,
      updatedBy: source.updatedBy,
    })
  }

  return citations
}

export async function answerMiloQuestionWithAgent({
  question,
  supabase,
  userContext,
}: {
  question: string
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  userContext: MiloUserContext
}): Promise<MiloAgentAnswer> {
  const model = getChatModel()
  const initialResearch = await buildInitialResearchBrief(question, supabase)
  let input: ResponseInputItem[] = [
    {
      role: "user",
      content: `${initialResearch.brief}\n\nUser question:\n${question}`,
    },
  ]
  const toolCalls: MiloAgentAnswer["metadata"]["toolCalls"] = [
    ...initialResearch.toolCalls,
  ]
  const sources: MiloSourceCard[] = [...initialResearch.sources]
  let response: unknown = null

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    response = await createAgentResponseWithOpenAI({
      model,
      instructions: `${MILO_AGENT_INSTRUCTIONS}\n\n${miloPermissionInstructions(userContext)}`,
      input,
      tools: [MILO_MCP_PROXY_TOOL],
      tool_choice: "auto",
      parallel_tool_calls: false,
      store: false,
    })

    const functionCalls = getResponseFunctionCalls(response)
    if (!functionCalls.length) {
      break
    }

    const functionOutputs: ResponseInputItem[] = []

    for (const functionCall of functionCalls) {
      let output: Awaited<ReturnType<typeof callMiloMcpTool>>

      try {
        const args = parseProxyArguments(functionCall.arguments)
        output = await callMiloMcpTool(args.toolName, args.arguments, supabase)
      } catch (error) {
        output = {
          ok: false,
          toolName: "db_schema",
          content: null,
          error:
            error instanceof Error
              ? error.message
              : "Unable to parse Milo MCP tool call.",
        }
      }

      toolCalls.push({
        toolName: output.toolName,
        ok: output.ok,
        error: output.error,
      })
      sources.push(...(output.sources ?? []))
      functionOutputs.push({
        type: "function_call_output",
        call_id: functionCall.call_id,
        output: JSON.stringify(output),
      })
    }

    input = [...input, ...getResponseOutputItems(response), ...functionOutputs]
  }

  const answer = getResponseText(response)
  if (!answer) {
    throw new Error("Milo agent did not return an answer.")
  }

  const chunks = sources.filter((source) => source.knowledgeChunkId)
  const confident = hasRetrievalConfidence(question, chunks)
  if (!confident) {
    const candidates = sources.filter(
      (source) =>
        source.sourceType === "wiki_page" &&
        source.url &&
        source.knowledgeChunkId
    )
    const unique = [
      ...new Map(candidates.map((source) => [source.url, source])).values(),
    ].slice(0, 3)
    return {
      answer:
        "I couldn't find an answer in the wiki. You can ask a manager or flag this gap.",
      model,
      citations: toCitations(
        unique.map((source) => ({ ...source, url: sourceUrl(source) }))
      ),
      metadata: {
        mode: "agentic_mcp",
        toolCalls,
        abstained: true,
        abstainReason: "low_retrieval_overlap",
      },
    }
  }
  const checked = checkAnswer(answer, chunks)
  return {
    answer: checked.answer,
    model,
    citations: toCitations(checked.citations),
    metadata: { mode: "agentic_mcp", toolCalls, abstained: false },
  }
}
