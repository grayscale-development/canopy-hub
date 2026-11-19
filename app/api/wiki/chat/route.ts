import { NextResponse } from "next/server"
import { z } from "zod"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { getMiloUserContext } from "@/lib/milo/user-context"
import { findPageCandidates } from "@/lib/milo/find-page"
import { getMiloProposal, saveMiloProposal } from "@/lib/milo/proposal-store"
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
  MAX_MILO_TWEAKS,
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
import { hubRouteContext } from "@/lib/milo/hub-map"
import { answerKnowledgeQuestion } from "@/lib/wiki-ai"
import { logAiAction } from "@/lib/ai-action-log"
import { resolveWikiKnowledgeUrls } from "@/lib/wiki-knowledge-urls"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { buildWikiBreadcrumbs } from "@/lib/wiki"
import type { MiloCurrentPage } from "@/lib/milo/current-page"
import { miloPagePath } from "@/lib/milo/page-index"
import { trimMiloHistory } from "@/lib/milo/history"

export const runtime = "nodejs"

interface ChatRequestBody {
  threadId?: unknown
  message?: unknown
  pageContext?: unknown
  currentPath?: unknown
}

const pageContextSchema = z.object({ pageId: z.string().uuid() })

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
      .is("deleted_at", null)
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
    .is("deleted_at", null)
    .maybeSingle()

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 400 })
  }

  if (!thread) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  }

  const { data: messages, error: messagesError } = await supabase
    .from("ai_chat_messages")
    .select("id,role,content,created_at,metadata,model")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 400 })
  }

  const messageIds = (messages ?? []).map((message) => message.id)
  const { data: citations, error: citationsError } = messageIds.length
    ? await supabase
        .from("ai_chat_citations")
        .select(
          "id,message_id,title,url,snippet,knowledge_source_id,knowledge_chunk_id"
        )
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
    Array<{
      title: string
      url: string | null
      snippet: string
      updatedAt?: string
      updatedBy?: string
    }>
  >()
  const citationOrder = new Map(
    (messages ?? []).map((message) => [
      message.id,
      Array.isArray(message.metadata?.citationOrder)
        ? message.metadata.citationOrder
        : [],
    ])
  )
  const orderedCitations = [...(citations ?? [])].sort((a, b) => {
    if (a.message_id !== b.message_id)
      return a.message_id.localeCompare(b.message_id)
    const order = citationOrder.get(a.message_id) ?? []
    const aIndex = order.indexOf(a.id)
    const bIndex = order.indexOf(b.id)
    return aIndex < 0 || bIndex < 0 ? 0 : aIndex - bIndex
  })
  for (const citation of orderedCitations) {
    if (wikiCitations.includes(citation)) {
      const url = citation.knowledge_source_id
        ? wikiUrls.get(citation.knowledge_source_id)
        : null
      if (!url) {
        // Keep citation numbers stable without exposing inaccessible source details.
        const existing = citationsByMessage.get(citation.message_id) ?? []
        existing.push({ title: "", url: null, snippet: "" })
        citationsByMessage.set(citation.message_id, existing)
        continue
      }
      citation.url =
        url +
        (citation.url?.includes("#")
          ? `#${citation.url.split("#").slice(1).join("#")}`
          : "")
    }
    const existing = citationsByMessage.get(citation.message_id) ?? []
    const message = (messages ?? []).find(
      (item) => item.id === citation.message_id
    )
    const details = Array.isArray(message?.metadata?.citationDetails)
      ? message.metadata.citationDetails
      : []
    const detail = details.find(
      (item: { knowledgeChunkId?: string | null }) =>
        item.knowledgeChunkId &&
        item.knowledgeChunkId === citation.knowledge_chunk_id
    )
    existing.push({
      ...mapCitationRow(citation),
      ...(detail?.updatedAt ? { updatedAt: detail.updatedAt } : {}),
      ...(detail?.updatedBy ? { updatedBy: detail.updatedBy } : {}),
    })
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

  const { data: ratings, error: ratingsError } = messageIds.length
    ? await supabase
        .from("ai_chat_message_ratings")
        .select("assistant_message_id,rating")
        .in("assistant_message_id", messageIds)
    : { data: [], error: null }
  if (ratingsError) {
    return NextResponse.json({ error: ratingsError.message }, { status: 400 })
  }
  const ratingsByMessage = new Map(
    (ratings ?? []).map((rating) => [
      rating.assistant_message_id,
      rating.rating,
    ])
  )

  const flaggedMessageIds = new Set<string>()
  for (const flag of flags ?? []) {
    if (flag.user_message_id) {
      flaggedMessageIds.add(flag.user_message_id)
    }
    if (flag.assistant_message_id) {
      flaggedMessageIds.add(flag.assistant_message_id)
    }
  }

  const displayMessages = await Promise.all(
    (messages ?? [])
      .filter(
        (message) => message.role === "user" || message.role === "assistant"
      )
      .map(async (message) => {
        const cards = await Promise.all(
          cardsFromMetadata(message.metadata).map(async (card) => {
            if (card.type !== "applied-edit" || card.undone) return card
            const stored = await getMiloProposal(thread.id, message.id, user.id)
            if (!stored?.applied_revision_id || stored.undone_revision_id)
              return { ...card, undoAvailable: false }
            const { data: node } = await supabase
              .from("wiki_nodes")
              .select("current_revision_id")
              .eq("id", stored.node_id)
              .maybeSingle()
            return {
              ...card,
              undoAvailable:
                node?.current_revision_id === stored.applied_revision_id,
            }
          })
        )
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
          citations: citationsByMessage.get(message.id) ?? [],
          cards,
          flagged: flaggedMessageIds.has(message.id),
          rating: ratingsByMessage.get(message.id),
          abstained: message.metadata?.abstained === true,
          stopped: message.metadata?.stopped === true,
          stopRequested: message.metadata?.stopRequested === true,
          error: message.metadata?.error === true,
          replyTo: message.metadata?.replyTo,
          trustedLinks:
            message.metadata?.trustedLinks === true ||
            (message.model === null && message.metadata?.abstained !== true),
        }
      })
  )
  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    },
    messages: displayMessages,
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

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (
    !(await userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const threadId = new URL(request.url).searchParams.get("threadId")?.trim()
  if (!z.string().uuid().safeParse(threadId).success) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  }
  const { data: thread, error } = await supabase
    .from("ai_chat_threads")
    .select("id,deleted_at")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error)
    return NextResponse.json(
      { error: "Could not delete chat." },
      { status: 500 }
    )
  if (!thread)
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  if (!thread.deleted_at) {
    const { error: updateError } = await supabase
      .from("ai_chat_threads")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
    if (updateError)
      return NextResponse.json(
        { error: "Could not delete chat." },
        { status: 500 }
      )
  }
  return NextResponse.json({ ok: true })
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
    let pageContext: unknown
    try {
      pageContext = JSON.parse(String(form?.get("pageContext") ?? "null"))
    } catch {
      pageContext = null
    }
    payload = {
      message: form?.get("message"),
      threadId: form?.get("threadId"),
      pageContext,
      currentPath: form?.get("currentPath"),
    }
  } else {
    payload = (await request.json().catch(() => null)) as ChatRequestBody | null
  }
  const message =
    typeof payload?.message === "string" ? payload.message.trim() : ""
  let threadId =
    typeof payload?.threadId === "string" ? payload.threadId.trim() : ""
  const parsedPage = pageContextSchema.safeParse(payload?.pageContext)
  let pageContext: MiloCurrentPage | undefined
  if (parsedPage.success) {
    const { data: node } = await supabase
      .from("wiki_nodes")
      .select("id,title,type,updated_at")
      .eq("id", parsedPage.data.pageId)
      .eq("type", "page")
      .maybeSingle()
    const { data: accessibleNode } = node
      ? await supabase
          .from("milo_wiki_nodes")
          .select("id")
          .eq("id", node.id)
          .maybeSingle()
      : { data: null }
    if (node && accessibleNode) {
      try {
        const {
          path,
          nodes,
          node: pageNode,
        } = await miloPagePath(supabase, node.id)
        const breadcrumbs =
          nodes && pageNode ? buildWikiBreadcrumbs(nodes, pageNode) : []
        pageContext = {
          pageId: node.id,
          title: node.title,
          kind: "wiki_page",
          ...(breadcrumbs[0] ? { area: breadcrumbs[0].title } : {}),
          ...(breadcrumbs[1]?.type === "folder"
            ? { section: breadcrumbs[1].title }
            : {}),
          url: `/wiki/${path}`,
          ...(node.updated_at ? { updatedAt: node.updated_at } : {}),
        }
      } catch {
        /* Ignore inaccessible or incomplete paths. */
      }
    }
  }
  if (!pageContext && typeof payload?.currentPath === "string") {
    pageContext = hubRouteContext(payload.currentPath)
  }
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
      .is("deleted_at", null)
      .maybeSingle()

    if (threadError) {
      return NextResponse.json({ error: threadError.message }, { status: 400 })
    }

    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 })
    }
    const { data: previous } = await supabase
      .from("ai_chat_messages")
      .select("id,metadata")
      .eq("thread_id", threadId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    previousState = previous?.metadata?.miloEdit as MiloEditState | undefined
    if (previousState?.stage === "page_confirmed" && previous?.id) {
      const stored = await getMiloProposal(threadId, previous.id, user.id)
      previousState =
        stored && !stored.applied_revision_id
          ? (stored.edit_state as MiloEditState)
          : undefined
    }
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

  const { data: priorMessages } = await supabase
    .from("ai_chat_messages")
    .select("role,content,metadata")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(30)
  const history = trimMiloHistory([...(priorMessages ?? [])].reverse())

  const { data: userMessage, error: userMessageError } = await supabase
    .from("ai_chat_messages")
    .insert({
      thread_id: threadId,
      user_id: user.id,
      role: "user",
      content: storedMessage,
      metadata: {
        ...(file ? { sourceFileName: file.name } : {}),
        ...(pageContext ? { pageContext } : {}),
      },
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

  const cancellation = new AbortController()
  const abort = () => cancellation.abort()
  if (request.signal.aborted) abort()
  else request.signal.addEventListener("abort", abort, { once: true })
  const checkStop = async () => {
    cancellation.signal.throwIfAborted()
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("metadata")
      .eq("id", userMessage.id)
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .eq("role", "user")
      .maybeSingle()
    if (error || !data) throw error ?? new Error("User message not found.")
    if (data.metadata?.stopRequested === true) cancellation.abort()
    cancellation.signal.throwIfAborted()
  }
  const encoder = new TextEncoder()
  let partial = ""
  let persistedAssistantId: string | null = null
  let cancelled = false
  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (event: MiloStreamEvent) => {
          if (!cancellation.signal.aborted)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            )
        }
        emit({ type: "meta", threadId, userMessageId: userMessage.id })
        try {
          await checkStop()
          const userContext = await getMiloUserContext(supabase, user)
          const sourceParts = splitSource(message, Boolean(file))
          const hasSource = sourceParts.hasSource || Boolean(file)
          const instruction =
            sourceParts.instruction || (!hasSource ? message : "")
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
              const { prepareMiloProposal } =
                await import("@/lib/milo/proposed-edit")
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
              if (!original?.content)
                throw new Error("Source message not found.")
              const extraction = await extractMiloFacts(
                original.content,
                message
              )
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
              workflowAnswer =
                "Okay. What would you like to know about the source?"
            } else {
              const { data: original } = await supabase
                .from("ai_chat_messages")
                .select("content")
                .eq("thread_id", threadId)
                .eq("id", previousState.sourceMessageId)
                .maybeSingle()
              if (!original?.content)
                throw new Error("Source message not found.")
              if (
                intent ||
                (previousState.stage === "awaiting_intent" &&
                  confirmed(message))
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
              state = {
                stage: "awaiting_intent",
                sourceMessageId: userMessage.id,
              }
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
                ...(pageContext ? { pageContext } : {}),
                history,
                signal: cancellation.signal,
                checkStop,
                deferActionLog: true,
                onStatus: (text) => emit({ type: "status", text }),
                onToken: (token) => {
                  partial += token
                  emit({ type: "token", token })
                },
              })
          await checkStop()
          if (!partial) emit({ type: "token", token: result.answer })
          // Model text and model/tool metadata are never interpreted as actionable cards.
          const metadata: Record<string, unknown> =
            "metadata" in result && result.metadata
              ? { ...result.metadata }
              : {}
          metadata.replyTo = userMessage.id
          if (result.model === null && metadata.abstained !== true)
            metadata.trustedLinks = true
          const citationDetails = result.citations
            .filter((citation) => citation.updatedAt || citation.updatedBy)
            .map((citation) => ({
              knowledgeChunkId: citation.knowledgeChunkId,
              updatedAt: citation.updatedAt,
              updatedBy: citation.updatedBy,
            }))
          if (citationDetails.length) metadata.citationDetails = citationDetails
          const citationIds = result.citations.map(() => crypto.randomUUID())
          if (citationIds.length) metadata.citationOrder = citationIds
          delete metadata.cards
          if (cards.length)
            metadata.cards = cards.map((card) => miloCardSchema.parse(card))
          await checkStop()
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
            throw assistantMessageError
          }
          persistedAssistantId = assistantMessage.id
          await checkStop()

          const proposal = cards.find((card) => card.type === "proposed-edit")
          if (proposal && state?.stage === "page_confirmed") {
            await saveMiloProposal({
              threadId,
              messageId: assistantMessage.id,
              userId: user.id,
              card: proposal,
              state,
            })
          }

          if (result.citations.length) {
            const { error: citationError } = await supabase
              .from("ai_chat_citations")
              .insert(
                result.citations.map((citation, index) => ({
                  id: citationIds[index],
                  message_id: assistantMessage.id,
                  knowledge_source_id: citation.knowledgeSourceId ?? null,
                  knowledge_chunk_id: citation.knowledgeChunkId ?? null,
                  title: citation.title,
                  url: citation.url,
                  snippet: citation.snippet,
                }))
              )

            if (citationError) {
              throw citationError
            }
          }

          await checkStop()
          if (!workflowAnswer)
            await logAiAction(supabase, { type: "milo_answer" })
          for (const event of cardEvents(assistantMessage.id, cards))
            emit(event)
          emit({
            type: "done",
            threadId,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage.id,
            citations: result.citations.map((citation) => ({
              title: citation.title,
              url: citation.url,
              snippet: citation.snippet,
              updatedAt: citation.updatedAt,
              updatedBy: citation.updatedBy,
            })),
            abstained: metadata.abstained === true,
            answer: result.answer,
            trustedLinks: metadata.trustedLinks === true,
          })
        } catch {
          if (!cancellation.signal.aborted) {
            try {
              await checkStop()
            } catch {
              // A recorded stop aborts the turn; other failures use the error path.
            }
          }
          if (cancellation.signal.aborted) {
            try {
              if (!partial.trim() && persistedAssistantId) {
                await supabase
                  .from("ai_chat_messages")
                  .delete()
                  .eq("id", persistedAssistantId)
              } else if (partial.trim()) {
                if (persistedAssistantId) {
                  await supabase
                    .from("ai_chat_citations")
                    .delete()
                    .eq("message_id", persistedAssistantId)
                  await supabase
                    .from("ai_chat_messages")
                    .update({
                      content: partial,
                      metadata: { stopped: true, replyTo: userMessage.id },
                    })
                    .eq("id", persistedAssistantId)
                } else {
                  await supabase.from("ai_chat_messages").insert({
                    thread_id: threadId,
                    user_id: user.id,
                    role: "assistant",
                    content: partial,
                    metadata: { stopped: true, replyTo: userMessage.id },
                  })
                }
              }
            } catch {
              /* The disconnected client cannot receive an error. */
            }
            return
          }
          const answer =
            file || splitSource(message, false).hasSource || previousState
              ? "Couldn't process the source. Please try again."
              : "Milo couldn't answer right now. Please try again."
          const cards: MiloCard[] = [
            miloCardSchema.parse({
              type: "error",
              id: "error",
              message: answer,
            }),
          ]

          const errorRow = {
            thread_id: threadId,
            user_id: user.id,
            role: "assistant",
            content: answer,
            metadata: {
              error: true,
              cards,
              replyTo: userMessage.id,
              ...(previousState ? { miloEdit: previousState } : {}),
            },
          }
          const errorQuery = persistedAssistantId
            ? supabase
                .from("ai_chat_messages")
                .update(errorRow)
                .eq("id", persistedAssistantId)
            : supabase.from("ai_chat_messages").insert(errorRow)
          const { data: assistantMessage } = await errorQuery
            .select("id")
            .single()

          if (assistantMessage) {
            for (const event of cardEvents(assistantMessage.id, cards))
              emit(event)
          } else emit({ type: "token", token: answer })
          emit({
            type: "done",
            threadId,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage?.id ?? null,
            citations: [],
            answer: assistantMessage ? "" : answer,
            error: true,
          })
        } finally {
          request.signal.removeEventListener("abort", abort)
          if (!cancelled) controller.close()
        }
      },
      cancel() {
        cancelled = true
        cancellation.abort()
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
