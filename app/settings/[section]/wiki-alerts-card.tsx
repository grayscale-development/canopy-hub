"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"

import {
  runWikiAlertsAction,
  type AlertsRunResult,
} from "@/app/settings/alerts-actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function WikiAlertsCard({
  lastSuccess,
  lastSuccessError,
  enabled,
}: {
  lastSuccess: string | null
  lastSuccessError: boolean
  enabled: boolean
}) {
  const [result, setResult] = React.useState<AlertsRunResult | null>(null)
  const [running, startTransition] = React.useTransition()
  const router = useRouter()
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Alerts check</CardTitle>
          <CardDescription>
            Last successful run:{" "}
            {lastSuccessError ? (
              "Unavailable"
            ) : lastSuccess ? (
              <time dateTime={lastSuccess}>
                {new Date(lastSuccess).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </time>
            ) : (
              "Never"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            disabled={!enabled || running}
            onClick={() => {
              setResult(null)
              startTransition(async () => {
                const next = await runWikiAlertsAction()
                setResult(next)
                if (next.ok) router.refresh()
              })
            }}
          >
            {running && (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            )}
            {running ? "Running alerts…" : "Run alerts now"}
          </Button>
          {!enabled && (
            <p className="text-sm text-muted-foreground">
              Alerts can&apos;t run in this environment.
            </p>
          )}
        </CardContent>
      </Card>
      <div aria-live="polite">
        {result &&
          (result.ok ? (
            <Card>
              <CardHeader>
                <CardTitle>Alerts check complete</CardTitle>
                <CardDescription>
                  {result.partial
                    ? "Some work could not be completed or saved. It will be retried on the next run."
                    : result.unchanged
                      ? "No pages have changed since the last check."
                      : "The check is complete."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Pages checked</dt>
                    <dd className="font-medium">{result.pages}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Alerts opened</dt>
                    <dd className="font-medium">{result.opened}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Alerts updated</dt>
                    <dd className="font-medium">{result.updated}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd className="font-medium">
                      {(result.durationMs / 1000).toFixed(1)}s
                    </dd>
                  </div>
                </dl>
                <Button asChild variant="outline">
                  <Link href="/wiki">View alerts</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-destructive" role="alert">
              {result.message}
            </p>
          ))}
      </div>
    </div>
  )
}
