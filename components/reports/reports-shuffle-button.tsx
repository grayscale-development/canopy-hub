"use client"

import * as React from "react"
import { ShuffleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FeaturedReport } from "@/lib/reports"

export function ReportsShuffleButton({
  reports,
}: {
  reports: FeaturedReport[]
}) {
  const [open, setOpen] = React.useState(false)
  const [selectedReportIds, setSelectedReportIds] = React.useState(
    () => new Set(reports.map((report) => report.id))
  )
  const [minutes, setMinutes] = React.useState("5")

  const selectedCount = selectedReportIds.size
  const canStart = selectedCount > 0

  function toggleReport(reportId: string) {
    setSelectedReportIds((current) => {
      const next = new Set(current)
      if (next.has(reportId)) {
        next.delete(reportId)
      } else {
        next.add(reportId)
      }
      return next
    })
  }

  function openShuffleWindow() {
    const minutesValue = Number.parseFloat(minutes)
    const safeMinutes =
      Number.isFinite(minutesValue) && minutesValue > 0 ? minutesValue : 5
    const params = new URLSearchParams({
      reports: reports
        .filter((report) => selectedReportIds.has(report.id))
        .map((report) => report.id)
        .join(","),
      minutes: String(safeMinutes),
    })
    const width = window.screen.availWidth || 1440
    const height = window.screen.availHeight || 900
    const shuffleWindow = window.open(
      `/reports/shuffle?${params.toString()}`,
      "canopy-reports-shuffle",
      `popup=yes,fullscreen=yes,width=${width},height=${height},left=0,top=0`
    )
    shuffleWindow?.focus()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-white/70 bg-white text-slate-950 shadow-sm hover:bg-white/90 focus-visible:ring-white/60 dark:border-white/85 dark:bg-[#CFCFCF] dark:text-slate-950 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.24),0_12px_28px_rgba(0,0,0,0.45)] dark:hover:bg-white"
        >
          <ShuffleIcon />
          Shuffle
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(94vw,42rem)]">
        <DialogHeader>
          <DialogTitle>Shuffle reports</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium">Include reports</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {reports.map((report) => (
                <Label
                  key={report.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedReportIds.has(report.id)}
                    onChange={() => toggleReport(report.id)}
                    className="size-4 rounded border-input accent-primary"
                  />
                  <span>{report.title}</span>
                </Label>
              ))}
            </div>
          </div>

          <div className="max-w-48">
            <Label htmlFor="report-shuffle-minutes">Minutes per report</Label>
            <Input
              id="report-shuffle-minutes"
              type="number"
              min="0.25"
              step="0.25"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className="mt-2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!canStart} onClick={openShuffleWindow}>
            Start shuffle
            <span className="text-primary-foreground/75">({selectedCount})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
