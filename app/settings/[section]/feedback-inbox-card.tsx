import "server-only"

import {
  FeedbackInbox,
  type FeedbackItem,
} from "@/app/settings/[section]/feedback-inbox"
import { Card, CardContent } from "@/components/ui/card"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveWikiKnowledgeUrls } from "@/lib/wiki-knowledge-urls"

type FeedbackRow = {
  id: string
  created_by: string
  type: string
  message: string
  page_path: string | null
  status: string
  created_at: string
}
type FlagRow = {
  id: string
  user_id: string | null
  assistant_message_id: string
  reason: string
  status: string
  user_message_content: string
  assistant_message_content: string
  created_at: string
  added_to_eval_set: boolean
}
type CitationRow = {
  message_id: string
  title: string
  url: string | null
  knowledge_source_id: string | null
}
type PersonRow = { user_id: string; display_name: string }

async function fetchAll<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = []
  const size = 500
  while (true) {
    const result = await page(rows.length, rows.length + size - 1)
    if (result.error) throw new Error("Could not load feedback.")
    const batch = result.data ?? []
    rows.push(...batch)
    if (batch.length < size) return rows
  }
}

export async function FeedbackInboxCard() {
  const viewer = await createSupabaseServerClient()
  const admin = createSupabaseAdminClient()
  const [feedback, flags, people] = await Promise.all([
    fetchAll<FeedbackRow>((from, to) =>
      viewer
        .from("feedback_items")
        .select("id,created_by,type,message,page_path,status,created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    fetchAll<FlagRow>((from, to) =>
      admin
        .from("ai_chat_message_flags")
        .select(
          "id,user_id,assistant_message_id,reason,status,user_message_content,assistant_message_content,created_at,added_to_eval_set"
        )
        .eq("acknowledged", true)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    fetchAll<PersonRow>((from, to) =>
      viewer.rpc("feedback_submitters").order("user_id").range(from, to)
    ),
  ])
  const ids = flags.map((row) => row.assistant_message_id)
  const batches = Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) =>
    ids.slice(i * 200, (i + 1) * 200)
  )
  const citations = (
    await Promise.all(
      batches.map((batch) =>
        fetchAll<CitationRow>((from, to) =>
          admin
            .from("ai_chat_citations")
            .select("message_id,title,url,knowledge_source_id")
            .in("message_id", batch)
            .order("created_at")
            .order("id")
            .range(from, to)
        )
      )
    )
  ).flat()
  const sourceIds = [
    ...new Set(
      citations.flatMap((c) =>
        c.knowledge_source_id ? [c.knowledge_source_id] : []
      )
    ),
  ]
  const urlBatches = await Promise.all(
    Array.from({ length: Math.ceil(sourceIds.length / 200) }, (_, i) =>
      resolveWikiKnowledgeUrls(viewer, sourceIds.slice(i * 200, (i + 1) * 200))
    )
  )
  const urls = new Map(urlBatches.flatMap((batch) => [...batch]))
  const names = new Map<string, string>(
    people.map((person: { user_id: string; display_name: string }) => [
      person.user_id,
      person.display_name,
    ])
  )
  const items: FeedbackItem[] = [
    ...feedback.map((row) => ({
      id: row.id,
      type: row.type as FeedbackItem["type"],
      message: row.message,
      pagePath: row.page_path,
      status: row.status as FeedbackItem["status"],
      submitter: names.get(row.created_by) ?? "Unknown user",
      createdAt: row.created_at,
    })),
    ...flags.map((row) => ({
      id: row.id,
      type: "milo" as const,
      message: row.reason,
      pagePath: null,
      status:
        row.status === "closed" ? ("resolved" as const) : ("open" as const),
      submitter:
        (row.user_id ? names.get(row.user_id) : null) ?? "Unknown user",
      createdAt: row.created_at,
      milo: {
        question: row.user_message_content,
        answer: row.assistant_message_content,
        addedToEvalSet: row.added_to_eval_set,
        sources: citations
          .filter((c) => c.message_id === row.assistant_message_id)
          .map((c) => ({
            title: c.title,
            url:
              c.url?.startsWith("/wiki/") && !c.url.startsWith("/wiki/tags")
                ? c.knowledge_source_id
                  ? (urls.get(c.knowledge_source_id) ?? null)
                  : null
                : c.url,
          })),
      },
    })),
  ]
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <Card>
      <CardContent>
        <FeedbackInbox initialItems={items} />
      </CardContent>
    </Card>
  )
}
