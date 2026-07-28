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
import { cn } from "@/lib/utils"

interface MiloFlagRow {
  id: string
  user_id: string | null
  assistant_message_id: string
  reason: string
  status: string
  user_message_content: string
  assistant_message_content: string
  created_at: string
}

interface MiloFlagCitationRow {
  message_id: string
  title: string
  url: string | null
  snippet: string | null
}

function getReporterName(user: {
  email?: string
  user_metadata?: Record<string, unknown>
}) {
  const metadata = user.user_metadata ?? {}
  const name =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null

  return name?.trim() || user.email || "Unknown user"
}

async function fetchMiloFlags(): Promise<MiloFlag[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("ai_chat_message_flags")
    .select(
      "id,user_id,assistant_message_id,reason,status,user_message_content,assistant_message_content,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as MiloFlagRow[]
  const assistantMessageIds = [
    ...new Set(rows.map((row) => row.assistant_message_id).filter(Boolean)),
  ]
  const userIds = [
    ...new Set(
      rows
        .map((row) => row.user_id)
        .filter((userId): userId is string => Boolean(userId))
    ),
  ]
  const usersById = new Map<
    string,
    { email?: string; user_metadata?: Record<string, unknown> }
  >()
  const citationsByMessageId = new Map<
    string,
    Array<{ title: string; url: string | null; snippet: string | null }>
  >()

  await Promise.all([
    Promise.all(
      userIds.map(async (userId) => {
        const { data: userData } = await supabase.auth.admin.getUserById(userId)
        if (userData.user) {
          usersById.set(userId, {
            email: userData.user.email,
            user_metadata: userData.user.user_metadata,
          })
        }
      })
    ),
    assistantMessageIds.length
      ? supabase
          .from("ai_chat_citations")
          .select("message_id,title,url,snippet")
          .in("message_id", assistantMessageIds)
          .order("created_at", { ascending: true })
          .then(({ data: citations, error: citationsError }) => {
            if (citationsError) {
              throw new Error(citationsError.message)
            }

            for (const citation of (citations ?? []) as MiloFlagCitationRow[]) {
              const existing =
                citationsByMessageId.get(citation.message_id) ?? []
              existing.push({
                title: citation.title,
                url: citation.url,
                snippet: citation.snippet,
              })
              citationsByMessageId.set(citation.message_id, existing)
            }
          })
      : Promise.resolve(),
  ])

  return rows.map((row) => {
    const reporter = row.user_id ? usersById.get(row.user_id) : null

    return {
      id: row.id,
      reporterName: reporter ? getReporterName(reporter) : "Unknown user",
      reporterEmail: reporter?.email ?? null,
      reason: row.reason,
      status:
        row.status === "reviewed" || row.status === "closed"
          ? row.status
          : "open",
      userMessage: row.user_message_content,
      assistantMessage: row.assistant_message_content,
      sources: citationsByMessageId.get(row.assistant_message_id) ?? [],
      createdAt: row.created_at,
    }
  })
}

type MiloSettingsTab = "flags" | "index"

const MILO_TABS: Array<{ key: MiloSettingsTab; label: string }> = [
  { key: "flags", label: "Flags" },
  { key: "index", label: "Index" },
]

export async function MiloFlagsCard({
  activeTab = "flags",
}: {
  activeTab?: MiloSettingsTab
}) {
  const flags = await fetchMiloFlags()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Milo</CardTitle>
        <CardDescription>
          Review flagged Ask Milo responses and manage the knowledge index.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2 border-b pb-4">
          {MILO_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={
                tab.key === "flags"
                  ? "/settings/milo"
                  : `/settings/milo?tab=${tab.key}`
              }
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {activeTab === "index" ? (
          <MiloIndexPanel />
        ) : flags.length ? (
          <MiloFlagsTable initialFlags={flags} />
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No Milo responses have been flagged yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
