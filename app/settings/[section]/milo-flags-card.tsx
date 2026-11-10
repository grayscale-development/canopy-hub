import "server-only"

import Link from "next/link"

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
import { cn } from "@/lib/utils"

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
  activeTab = "flags",
  canManageWiki,
}: {
  activeTab?: "flags" | "index"
  canManageWiki: boolean
}) {
  const showFeedback = canManageWiki && activeTab === "flags"
  const supabase = await createSupabaseServerClient()
  const [flags, gaps] = showFeedback
    ? await Promise.all([
        fetchMiloFlags(),
        supabase.rpc("milo_gap_counts").then(({ data, error }) => {
          if (error) throw new Error(error.message)
          return data as Array<{
            page_id: string | null
            page_title: string
            question_count: number
          }>
        }),
      ])
    : [[], []]

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI</CardTitle>
        <CardDescription>
          Manage Milo feedback and the knowledge index.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2 border-b pb-4">
          {[
            ...(canManageWiki
              ? [{ key: "flags", label: "Milo feedback" }]
              : []),
            { key: "index", label: "Index" },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={
                tab.key === "flags" ? "/settings/ai" : "/settings/ai?tab=index"
              }
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors",
                (showFeedback ? tab.key === "flags" : tab.key === "index")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {showFeedback ? (
          <div className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">
                Questions Milo couldn&apos;t answer
              </h2>
              <p className="text-sm text-muted-foreground">
                Counts by a suggested wiki page. Questions are only shown when
                someone shares them below.
              </p>
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
            </section>
            <MiloFlagsTable initialFlags={flags} />
          </div>
        ) : (
          <MiloIndexPanel />
        )}
      </CardContent>
    </Card>
  )
}
