import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { getMiloUserContext } from "@/lib/milo/user-context"
import { findPageCandidates } from "@/lib/milo/find-page"
import { MAX_MILO_TWEAKS, prepareMiloProposal } from "@/lib/milo/proposed-edit"
import {
  answerMiloSourceQuestion,
  confirmed,
  editIntent,
  extractMiloFacts,
  formatMiloExtraction,
  splitSource,
  type MiloEditState,
} from "@/lib/milo/source-workflow"
import {
  MILO_FILE_MAX_BYTES,
  MILO_SOURCE_MAX_CHARS,
} from "@/lib/milo/source-limits"
import { extractWikiDocumentText } from "@/lib/wiki-extract"
import PostalMime from "postal-mime"
import {
  cardEvents,
  cardsFromMetadata,
  miloCardSchema,
  type MiloCard,
  type MiloStreamEvent,
} from "@/lib/milo/chat-cards"
import { answerKnowledgeQuestion } from "@/lib/wiki-ai"
import { resolveWikiKnowledgeUrls } from "@/lib/wiki-knowledge-urls"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

interface ChatRequestBody {
  threadId?: unknown
  message?: unknown
}

function mapCitationRow(row: {
  title: string
  url: string | null
  snippet: string
}) {
  return {
    title: row.title,
    url: row.url,
    snippet: row.snippet,
  }
}

function streamEvents(events: MiloStreamEvent[]) {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
          await new Promise((resolve) => setTimeout(resolve, 8))
        }
        controller.close()
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    }
  )
}

function getChatErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unable to answer from the knowledge base."

  if (
    message === "Missing OPENAI_API_KEY." ||
    message === "Missing OPENAI_CHAT_MODEL."
  ) {
    return "Milo is missing its OpenAI configuration in this runtime. Please check the production environment variables and restart/redeploy the app."
  }

  return message
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canAccessBeta1 = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: BETA_1_PERMISSION,
  })

  if (!canAccessBeta1) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const threadId = searchParams.get("threadId")?.trim()

  if (!threadId) {
    const { data: threads, error } = await supabase
      .from("ai_chat_threads")
      .select("id,title,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      threads: (threads ?? []).map((thread) => ({
        id: thread.id,
        title: thread.title,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
      })),
    })
  }

  const { data: thread, error: threadError } = await supabase
    .from("ai_chat_threads")
    .select("id,title,created_at,updated_at")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 400 })
  }

  if (!thread) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  }

  const { data: messages, error: messagesError } = await supabase
    .from("ai_chat_messages")
    .select("id,role,content,created_at,metadata")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 400 })
  }

  const messageIds = (messages ?? []).map((message) => message.id)
  const { data: citations, error: citationsError } = messageIds.length
    ? await supabase
        .from("ai_chat_citations")
        .select("message_id,title,url,snippet,knowledge_source_id")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null }

  if (citationsError) {
    return NextResponse.json({ error: citationsError.message }, { status: 400 })
  }

  const wikiCitations = (citations ?? []).filter(
    (citation) =>
      citation.url?.startsWith("/wiki/") &&
      !citation.url.startsWith("/wiki/tags")
  )
  const wikiUrls = await resolveWikiKnowledgeUrls(
    supabase,
    wikiCitations.flatMap((citation) =>
      citation.knowledge_source_id ? [citation.knowledge_source_id] : []
    )
  )

  const citationsByMessage = new Map<
    string,
    Array<{ title: string; url: string | null; snippet: string }>
  >()
  for (const citation of citations ?? []) {
    if (wikiCitations.includes(citation)) {
      const url = citation.knowledge_source_id
        ? wikiUrls.get(citation.knowledge_source_id)
        : null
      if (!url) continue
      citation.url = url
    }
    const existing = citationsByMessage.get(citation.message_id) ?? []
    existing.push(mapCitationRow(citation))
    citationsByMessage.set(citation.message_id, existing)
  }

  const { data: flags, error: flagsError } = messageIds.length
    ? await supabase
        .from("ai_chat_message_flags")
        .select("user_message_id,assistant_message_id")
        .eq("thread_id", thread.id)
    : { data: [], error: null }

  if (flagsError) {
    return NextResponse.json({ error: flagsError.message }, { status: 400 })
  }

  const flaggedMessageIds = new Set<string>()
  for (const flag of flags ?? []) {
    if (flag.user_message_id) {
      flaggedMessageIds.add(flag.user_message_id)
    }
    if (flag.assistant_message_id) {
      flaggedMessageIds.add(flag.assistant_message_id)
    }
  }

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    },
    messages: (messages ?? [])
      .filter(
        (message) => message.role === "user" || message.role === "assistant"
      )
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
        citations: citationsByMessage.get(message.id) ?? [],
        cards: cardsFromMetadata(message.metadata),
        flagged: flaggedMessageIds.has(message.id),
      })),
  })
}

async function readSourceFile(file: File) {
  if (file.name.toLowerCase().endsWith(".eml")) {
    const email = await PostalMime.parse(await file.arrayBuffer())
    let body = email.text ?? ""
    if (!body && email.html) {
      // The repository uses jsdom on the server without bundled declarations.
      // @ts-expect-error jsdom does not publish TypeScript declarations.
      const { JSDOM } = await import("jsdom")
      body = new JSDOM(email.html).window.document.body.textContent ?? ""
    }
    return [
      `From: ${email.from?.name ?? ""} ${email.from?.address ?? ""}`.trim(),
      `Date: ${email.date ?? ""}`,
      `Subject: ${email.subject ?? ""}`,
      "",
      body,
    ]
      .join("\n")
      .trim()
  }
  return extractWikiDocumentText(file)
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canAccessBeta1 = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: BETA_1_PERMISSION,
  })

  if (!canAccessBeta1) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let payload: ChatRequestBody | null = null
  let file: File | null = null
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null)
    const entry = form?.get("file")
    file = entry instanceof File ? entry : null
    payload = { message: form?.get("message"), threadId: form?.get("threadId") }
  } else {
    payload = (await request.json().catch(() => null)) as ChatRequestBody | null
  }
  const message =
    typeof payload?.message === "string" ? payload.message.trim() : ""
  let threadId =
    typeof payload?.threadId === "string" ? payload.threadId.trim() : ""
  if (!message && !file) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 })
  }
  if (message.length > MILO_SOURCE_MAX_CHARS) {
    return NextResponse.json(
      { error: "Text is too long. Use 100,000 characters or fewer." },
      { status: 400 }
    )
  }
  let fileText = ""
  if (file) {
    if (!/\.(?:eml|txt|pdf|docx)$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Choose an .eml, .txt, .pdf, or .docx file." },
        { status: 400 }
      )
    }
    if (file.size > MILO_FILE_MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Choose a file under 5 MB." },
        { status: 400 }
      )
    }
    try {
      fileText = await readSourceFile(file)
    } catch {
      return NextResponse.json(
        {
          error: "Couldn't read this file. Try another file or paste the text.",
        },
        { status: 400 }
      )
    }
    if (!fileText.trim()) {
      return NextResponse.json(
        { error: "No readable text found in this file." },
        { status: 400 }
      )
    }
    if (message.length + fileText.length > MILO_SOURCE_MAX_CHARS) {
      return NextResponse.json(
        { error: "Text is too long. Use 100,000 characters or fewer." },
        { status: 400 }
      )
    }
  }
  const storedMessage = file
    ? [message, fileText].filter(Boolean).join("\n\n")
    : message
  let previousState: MiloEditState | undefined

  if (threadId) {
    const { data: thread, error: threadError } = await supabase
      .from("ai_chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (threadError) {
      return NextResponse.json({ error: threadError.message }, { status: 400 })
    }

    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 })
    }
    const { data: previous } = await supabase
      .from("ai_chat_messages")
      .select("metadata")
      .eq("thread_id", threadId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    previousState = previous?.metadata?.miloEdit as MiloEditState | undefined
  } else {
    const { data: thread, error: createThreadError } = await supabase
      .from("ai_chat_threads")
      .insert({
        user_id: user.id,
        title: (message || file?.name || "Source material").slice(0, 80),
      })
      .select("id")
      .single()

    if (createThreadError) {
      return NextResponse.json(
        { error: createThreadError.message },
        { status: 400 }
      )
    }

    threadId = thread.id
  }

  const { data: userMessage, error: userMessageError } = await supabase
    .from("ai_chat_messages")
    .insert({
      thread_id: threadId,
      user_id: user.id,
      role: "user",
      content: storedMessage,
      metadata: file ? { sourceFileName: file.name } : {},
    })
    .select("id")
    .single()

  if (userMessageError) {
    return NextResponse.json(
      { error: userMessageError.message },
      { status: 400 }
    )
  }

  await supabase
    .from("ai_chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", user.id)

  try {
    const userContext = await getMiloUserContext(supabase, user)
    const sourceParts = splitSource(message, Boolean(file))
    const hasSource = sourceParts.hasSource || Boolean(file)
    const instruction = sourceParts.instruction || (!hasSource ? message : "")
    const intent =
      editIntent(instruction) &&
      !/^(?:how|what|where|why|when|who)\b/i.test(instruction)
    let state: MiloEditState | undefined
    let workflowAnswer = ""
    const cards: MiloCard[] = []
    const canManage = userContext.capabilities["wiki.manage"]
    const managerNames = userContext.wikiManagers?.join(", ")
    const sourceQuestion =
      hasSource && sourceParts.instruction.includes("?") && !intent
    if (sourceQuestion) {
      workflowAnswer = await answerMiloSourceQuestion(
        file ? fileText : sourceParts.source,
        sourceParts.instruction
      )
    } else if (!canManage && hasSource && !intent) {
      state = {
        stage: "awaiting_source_question",
        sourceMessageId: userMessage.id,
      }
      workflowAnswer = "What would you like to know about this source?"
    } else if (
      !canManage &&
      (hasSource ||
        previousState?.stage === "awaiting_source" ||
        previousState?.stage === "awaiting_intent" ||
        previousState?.stage === "awaiting_confirmation" ||
        previousState?.stage === "page_confirmed")
    ) {
      workflowAnswer = `You don't have permission to edit the wiki. ${managerNames ? `Please contact ${managerNames}.` : "Please contact a Wiki manager."}`
    } else if (
      canManage &&
      !hasSource &&
      previousState?.stage === "page_confirmed"
    ) {
      const rounds = previousState.rounds ?? 0
      if (rounds >= MAX_MILO_TWEAKS) {
        state = previousState
        workflowAnswer =
          "That's the limit for adjustments to this proposal. Start a new chat to make more changes."
      } else {
        const feedback = [...(previousState.feedback ?? []), message]
        const prepared = await prepareMiloProposal({
          supabase,
          pageId: previousState.pageId,
          extraction: previousState.extraction,
          baseRevisionId: previousState.baseRevisionId,
          feedback,
        })
        state = {
          ...previousState,
          baseRevisionId: prepared.baseRevisionId,
          rounds: previousState.rounds === undefined ? 0 : rounds + 1,
          feedback,
        }
        cards.push(prepared.card)
        workflowAnswer =
          "Here's the revised proposal. No changes have been made to the page."
      }
    } else if (
      canManage &&
      !hasSource &&
      previousState?.stage === "awaiting_confirmation" &&
      confirmed(message) &&
      previousState.extraction.facts.length &&
      !previousState.extraction.unclear.length
    ) {
      state = { ...previousState, stage: "ready_to_find_page" }
      const candidates = await findPageCandidates(
        supabase,
        previousState.extraction.facts
      )
      cards.push({
        type: "page-candidates",
        id: "page-candidates",
        title: "Is this the page you mean?",
        candidates,
        current: 0,
      })
      workflowAnswer = candidates.length
        ? "Here is the closest match I found."
        : "I couldn't find an editable matching page."
    } else if (
      canManage &&
      !hasSource &&
      previousState?.stage === "ready_to_find_page"
    ) {
      state = previousState
      const candidates = await findPageCandidates(
        supabase,
        previousState.extraction.facts
      )
      cards.push({
        type: "page-candidates",
        id: "page-candidates",
        title: "Is this the page you mean?",
        candidates,
        current: 0,
      })
      workflowAnswer = candidates.length
        ? "Here is the closest match I found."
        : "I couldn't find an editable matching page."
    } else if (
      canManage &&
      !hasSource &&
      previousState?.stage === "awaiting_confirmation"
    ) {
      if (confirmed(message)) {
        state = previousState
        workflowAnswer = previousState.extraction.unclear.length
          ? `Please clarify: ${previousState.extraction.unclear.join(" ")}`
          : "Please provide a change to add before confirming."
      } else if (/^(?:no|nope|not quite)[.!\s]*$/i.test(message)) {
        state = previousState
        workflowAnswer = "What should I change or clarify in the list?"
      } else {
        const { data: original } = await supabase
          .from("ai_chat_messages")
          .select("content")
          .eq("thread_id", threadId)
          .eq("id", previousState.sourceMessageId)
          .maybeSingle()
        if (!original?.content) throw new Error("Source message not found.")
        const extraction = await extractMiloFacts(original.content, message)
        state = {
          stage: "awaiting_confirmation",
          sourceMessageId: previousState.sourceMessageId,
          extraction,
        }
        workflowAnswer = formatMiloExtraction(extraction)
      }
    } else if (
      !hasSource &&
      ((canManage && previousState?.stage === "awaiting_intent") ||
        previousState?.stage === "awaiting_source_question")
    ) {
      if (!canManage && intent) {
        workflowAnswer = `You don't have permission to edit the wiki. ${managerNames ? `Please contact ${managerNames}.` : "Please contact a Wiki manager."}`
      } else if (/^(?:no|nope)[.!\s]*$/i.test(message)) {
        state = {
          stage: "awaiting_source_question",
          sourceMessageId: previousState.sourceMessageId,
        }
        workflowAnswer = "Okay. What would you like to know about the source?"
      } else {
        const { data: original } = await supabase
          .from("ai_chat_messages")
          .select("content")
          .eq("thread_id", threadId)
          .eq("id", previousState.sourceMessageId)
          .maybeSingle()
        if (!original?.content) throw new Error("Source message not found.")
        if (
          intent ||
          (previousState.stage === "awaiting_intent" && confirmed(message))
        ) {
          const extraction = await extractMiloFacts(original.content)
          state = {
            stage: "awaiting_confirmation",
            sourceMessageId: previousState.sourceMessageId,
            extraction,
          }
          workflowAnswer = formatMiloExtraction(extraction)
        } else {
          workflowAnswer = await answerMiloSourceQuestion(
            original.content,
            message
          )
        }
      }
    } else if (
      canManage &&
      (hasSource || previousState?.stage === "awaiting_source")
    ) {
      if (intent || previousState?.stage === "awaiting_source") {
        const extraction = await extractMiloFacts(
          file ? fileText : sourceParts.source
        )
        state = {
          stage: "awaiting_confirmation",
          sourceMessageId: userMessage.id,
          extraction,
        }
        workflowAnswer = formatMiloExtraction(extraction)
      } else {
        state = { stage: "awaiting_intent", sourceMessageId: userMessage.id }
        workflowAnswer =
          "Would you like me to extract changes from this for the wiki?"
      }
    } else if (
      canManage &&
      intent &&
      !hasSource &&
      /\b(?:wiki|this|it)\b/i.test(message)
    ) {
      state = { stage: "awaiting_source" }
      workflowAnswer =
        "Paste the source text or attach a file, and I'll extract the changes."
    }
    const result = workflowAnswer
      ? {
          answer: workflowAnswer,
          model: "milo-edit-workflow",
          citations: [],
          metadata: state ? { miloEdit: state } : {},
        }
      : await answerKnowledgeQuestion({
          supabase,
          question: message,
          userContext,
        })
    // Model text and model/tool metadata are never interpreted as actionable cards.
    const metadata: Record<string, unknown> =
      "metadata" in result && result.metadata ? { ...result.metadata } : {}
    delete metadata.cards
    if (cards.length)
      metadata.cards = cards.map((card) => miloCardSchema.parse(card))
    const { data: assistantMessage, error: assistantMessageError } =
      await supabase
        .from("ai_chat_messages")
        .insert({
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content: result.answer,
          model: result.model,
          metadata,
        })
        .select("id")
        .single()

    if (assistantMessageError) {
      return NextResponse.json(
        { error: assistantMessageError.message },
        { status: 400 }
      )
    }

    if (result.citations.length) {
      const { error: citationError } = await supabase
        .from("ai_chat_citations")
        .insert(
          result.citations.map((citation) => ({
            message_id: assistantMessage.id,
            knowledge_source_id: citation.knowledgeSourceId ?? null,
            knowledge_chunk_id: citation.knowledgeChunkId ?? null,
            title: citation.title,
            url: citation.url,
            snippet: citation.snippet,
          }))
        )

      if (citationError) {
        return NextResponse.json(
          { error: citationError.message },
          { status: 400 }
        )
      }
    }

    const words = result.answer.split(/(\s+)/).filter(Boolean)
    return streamEvents([
      { type: "meta", threadId },
      ...words.map((token) => ({ type: "token" as const, token })),
      ...cardEvents(assistantMessage.id, cards),
      {
        type: "done",
        threadId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        citations: result.citations.map((citation) => ({
          title: citation.title,
          url: citation.url,
          snippet: citation.snippet,
        })),
      },
    ])
  } catch (error) {
    const answer =
      file || message.includes("\n") || previousState
        ? "Couldn't process the source. Please try again."
        : getChatErrorMessage(error)
    const cards: MiloCard[] = [
      miloCardSchema.parse({ type: "error", id: "error", message: answer }),
    ]

    const { data: assistantMessage } = await supabase
      .from("ai_chat_messages")
      .insert({
        thread_id: threadId,
        user_id: user.id,
        role: "assistant",
        content: answer,
        metadata: {
          error: true,
          cards,
          ...(previousState ? { miloEdit: previousState } : {}),
        },
      })
      .select("id")
      .single()

    return streamEvents([
      { type: "meta", threadId },
      ...(assistantMessage
        ? cardEvents(assistantMessage.id, cards)
        : [{ type: "token" as const, token: answer }]),
      {
        type: "done",
        threadId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage?.id ?? null,
        citations: [],
      },
    ])
  }
}
