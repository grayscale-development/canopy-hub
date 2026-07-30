import { NextResponse } from "next/server"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { answerKnowledgeQuestion } from "@/lib/wiki-ai"
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

function streamEvents(events: unknown[]) {
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
    .select("id,role,content,created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 400 })
  }

  const messageIds = (messages ?? []).map((message) => message.id)
  const { data: citations, error: citationsError } = messageIds.length
    ? await supabase
        .from("ai_chat_citations")
        .select("message_id,title,url,snippet")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null }

  if (citationsError) {
    return NextResponse.json({ error: citationsError.message }, { status: 400 })
  }

  const citationsByMessage = new Map<
    string,
    Array<{ title: string; url: string | null; snippet: string }>
  >()
  for (const citation of citations ?? []) {
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
        flagged: flaggedMessageIds.has(message.id),
      })),
  })
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

  const payload = (await request
    .json()
    .catch(() => null)) as ChatRequestBody | null
  const message =
    typeof payload?.message === "string" ? payload.message.trim() : ""
  let threadId =
    typeof payload?.threadId === "string" ? payload.threadId.trim() : ""

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 })
  }

  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 })
  }

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
  } else {
    const { data: thread, error: createThreadError } = await supabase
      .from("ai_chat_threads")
      .insert({
        user_id: user.id,
        title: message.slice(0, 80),
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
      content: message,
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
    const result = await answerKnowledgeQuestion({
      supabase,
      question: message,
    })
    const { data: assistantMessage, error: assistantMessageError } =
      await supabase
        .from("ai_chat_messages")
        .insert({
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content: result.answer,
          model: result.model,
          metadata:
            "metadata" in result && result.metadata
              ? result.metadata
              : {},
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
      ...words.map((token) => ({ type: "token", token })),
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
      error instanceof Error
        ? error.message
        : "Unable to answer from the knowledge base."

    const { data: assistantMessage } = await supabase
      .from("ai_chat_messages")
      .insert({
        thread_id: threadId,
        user_id: user.id,
        role: "assistant",
        content: answer,
        metadata: { error: true },
      })
      .select("id")
      .single()

    return streamEvents([
      { type: "meta", threadId },
      { type: "token", token: answer },
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
