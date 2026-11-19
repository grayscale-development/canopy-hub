import "server-only"

import {
  MiloFlagsTable,
  type MiloFlag,
} from "@/app/settings/[section]/milo-flags-table"
import { MiloIndexPanel } from "@/app/settings/[section]/milo-index-panel"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveWikiKnowledgeUrls } from "@/lib/wiki-knowledge-urls"

async function fetchMiloFlags(): Promise<MiloFlag[]> {
  const admin = createSupabaseAdminClient()
  const viewer = await createSupabaseServerClient()
  const { data: rows, error } = await admin
    .from("ai_chat_message_flags")
    .select(
      "id,assistant_message_id,reason,status,user_message_content,assistant_message_content,created_at,added_to_eval_set"
    )
    .eq("acknowledged", true)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  const ids = (rows ?? []).map((row) => row.assistant_message_id)
  if (!ids.length) return []
  const [messages, citations] = await Promise.all([
    admin.from("ai_chat_messages").select("id,metadata").in("id", ids),
    admin
      .from("ai_chat_citations")
      .select("message_id,title,url,knowledge_source_id")
      .in("message_id", ids)
      .order("created_at"),
  ])
  if (messages.error) throw new Error(messages.error.message)
  if (citations.error) throw new Error(citations.error.message)
  const urls = await resolveWikiKnowledgeUrls(
    viewer,
    (citations.data ?? []).flatMap((c) =>
      c.knowledge_source_id ? [c.knowledge_source_id] : []
    )
  )
  return (rows ?? []).map((row) => ({
    id: row.id,
    reason: row.reason,
    status: row.status as MiloFlag["status"],
    userMessage: row.user_message_content,
    assistantMessage: row.assistant_message_content,
    abstained:
      messages.data?.find((message) => message.id === row.assistant_message_id)
        ?.metadata?.abstained === true,
    addedToEvalSet: row.added_to_eval_set,
    sources: (citations.data ?? [])
      .filter((citation) => citation.message_id === row.assistant_message_id)
      .map((citation) => ({
        title: citation.title,
        url:
          citation.url?.startsWith("/wiki/") &&
          !citation.url.startsWith("/wiki/tags")
            ? citation.knowledge_source_id
              ? (urls.get(citation.knowledge_source_id) ?? null)
              : null
            : citation.url,
      })),
    createdAt: row.created_at,
  }))
}

export async function MiloFlagsCard({
  section,
  canManageWiki,
}: {
  section: "feedback" | "milo"
  canManageWiki: boolean
}) {
  const supabase = await createSupabaseServerClient()
  const flags =
    section === "feedback" && canManageWiki ? await fetchMiloFlags() : []
  const gaps =
    section === "milo" && canManageWiki
      ? await supabase.rpc("milo_gap_counts").then(({ data, error }) => {
          if (error) throw new Error(error.message)
          return data as Array<{
            page_id: string | null
            page_title: string
            question_count: number
          }>
        })
      : []

  if (section === "feedback") {
    return (
      <Card>
        <CardContent>
          <MiloFlagsTable initialFlags={flags} />
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <MiloIndexPanel />
        </CardContent>
      </Card>
      {canManageWiki && (
        <Card>
          <CardHeader>
            <CardTitle>Questions Milo couldn&apos;t answer</CardTitle>
            <CardDescription>
              Counts by a suggested wiki page. Questions are only shown when
              someone shares them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gaps.length ? (
              <ul className="space-y-1 text-sm">
                {gaps.map((gap) => (
                  <li key={gap.page_id ?? "none"}>
                    {gap.page_title}: {gap.question_count}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No unanswered questions yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
