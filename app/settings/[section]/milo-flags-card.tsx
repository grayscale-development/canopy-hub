import "server-only"

import { MiloIndexPanel } from "@/app/settings/[section]/milo-index-panel"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function MiloFlagsCard({
  canManageWiki,
}: {
  section: "milo"
  canManageWiki: boolean
}) {
  const supabase = await createSupabaseServerClient()
  const gaps = canManageWiki
    ? await supabase.rpc("milo_gap_counts").then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return data as Array<{
          page_id: string | null
          page_title: string
          question_count: number
        }>
      })
    : []
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
