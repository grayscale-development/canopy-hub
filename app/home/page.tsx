import { redirect } from "next/navigation"
import Link from "next/link"
import {
  BadgeDollarSignIcon,
  ChevronDownIcon,
  CompassIcon,
  CpuIcon,
  ExternalLinkIcon,
  HandHeartIcon,
  HandshakeIcon,
  LeafIcon,
  LightbulbIcon,
  ScaleIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaYoutube,
} from "react-icons/fa"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { AprilSummaryTable } from "@/components/home/april-summary-table"
import { CanopyProductionChart } from "@/components/home/canopy-production-chart"
import { FundedLoansByProgramPieChart } from "@/components/home/funded-loans-by-program-pie-chart"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  fetchAprilBranchSummaryFromRpc,
  fetchAprilDivisionSummaryFromRpc,
  type LeaderboardEntityKey,
  fetchAprilLoanOfficerSummaryFromRpc,
  fetchAprilProcessorSummaryFromRpc,
  fetchAprilUnderwriterSummaryFromRpc,
  fetchAprilUnderwritingOrgSummaryFromRpc,
  fetchCanopyProductionSeriesFromRpc,
  fetchCorporateTurnSummaryFromRpc,
  fetchPreviousMonthLoanProgramSummaryFromRpc,
} from "@/lib/hub-data"
import type { FileViewerFilterField } from "@/lib/file-viewer-filters"
import type { FileViewerFilterOperator } from "@/lib/file-viewer-filters"
import {
  compareNewsletterFilesDescending,
  NEWSLETTER_BUCKET,
  parseNewsletterFileName,
  type NewsletterFileSummary,
} from "@/lib/newsletters"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Home",
}

const SOCIAL_MEDIA_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/canopy.mortgage",
    icon: FaInstagram,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/canopy-mortgage",
    icon: FaLinkedinIn,
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@canopymortgage",
    icon: FaYoutube,
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/people/CanopyMortgage/61555767074405",
    icon: FaFacebookF,
  },
] as const

const HELPFUL_RESOURCE_LINKS = [
  {
    label: "Canopy Wiki",
    description: "Training docs and process guides.",
    href: "https://sites.google.com/canopymortgage.com/trainingwiki/home?authuser=0",
    external: true,
  },
  {
    label: "Department Directory",
    description: "Open the department directory.",
    href: "/support",
    external: false,
  },
  {
    label: "Compliment Your Team",
    description: "Submit recognition for a teammate.",
    href: "https://docs.google.com/forms/d/e/1FAIpQLSd8FR2h37lG3e64t9_qNIoAn6qkUQaiycSyTzrGQO4unHaceA/viewform",
    external: true,
  },
] as const

const MISSION_POINTS = [
  {
    label: "Better Tech",
    icon: CpuIcon,
  },
  {
    label: "Better Pricing",
    icon: BadgeDollarSignIcon,
  },
  {
    label: "Better Relationships",
    icon: HandshakeIcon,
  },
] as const

const COMPANY_VALUES = [
  {
    title: "Do more with less",
    description:
      "We utilize the resources we already have at our disposal to drive success. Sometimes it means we dig deep and look for outside-the-box solutions to achieve desired outcomes.",
    icon: ScaleIcon,
  },
  {
    title: "Act like an owner",
    description:
      "We own our roles and our decisions. When faced with a challenge, we consider all the options in the context of moving the organization towards success. We also own our mistakes, learn from them, and keep going.",
    icon: CompassIcon,
  },
  {
    title: "Find opportunities to serve",
    description:
      "Be it a stranger, a coworker, a customer, a loved one, or even ourselves, we look for chances to extend a helping hand when someone is in need.",
    icon: HandHeartIcon,
  },
  {
    title: "Seek to understand",
    description:
      "We all want to be heard. When we seek to understand, we affirm what the other person has said. We listen. We value the other person and their point of view.",
    icon: SearchIcon,
  },
  {
    title: "Be a disruptive innovator",
    description: "We challenge how we do something.",
    icon: LightbulbIcon,
  },
  {
    title: "Be kind",
    description:
      "We act generously with a concern for others without expecting praise or reward in return.",
    icon: SparklesIcon,
  },
] as const

function ValuesGrid() {
  return (
    <div className="mt-3 grid gap-x-6 gap-y-5 md:grid-cols-2">
      {COMPANY_VALUES.map((value) => (
        <div key={value.title} className="flex gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <value.icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">
              {value.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {value.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function CultureSection() {
  return (
    <section className="rounded-xl border bg-card p-6 text-card-foreground">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Vision &amp; Mission
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Building a better mortgage experience
        </h2>
      </div>
      <div className="mt-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase">
          <LeafIcon className="h-4 w-4" />
          Mission
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {MISSION_POINTS.map((point) => (
            <div
              key={point.label}
              className="group flex min-h-24 flex-col justify-between rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <point.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="mt-4 text-lg font-semibold tracking-tight">
                  {point.label}
                </p>
                <div className="mt-2 h-1 w-16 rounded-full bg-primary/20 transition-colors group-hover:bg-primary/35" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <details className="group mt-5 rounded-lg border bg-muted/20">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
          <span>Show values</span>
          <ChevronDownIcon className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t px-4 pb-4">
          <ValuesGrid />
        </div>
      </details>
    </section>
  )
}

const CORPORATE_TURN_SECTION_LABELS: Record<string, string> = {
  Processing: "Corporate Processing Metrics",
  Underwriting: "Corporate Underwriting Metrics",
  Closing: "Corporate Closing Metrics",
}

const CORPORATE_TURN_SECTION_ORDER = ["Processing", "Underwriting", "Closing"]

const WHOLE_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const ONE_DECIMAL_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const ENTITY_FILTER_FIELD: Record<LeaderboardEntityKey, FileViewerFilterField> = {
  division: "division",
  branch: "branch",
  loanOfficer: "loanOfficer",
  processor: "processor",
  underwriter: "underwriter",
  underwritingOrg: "underwritingOrg",
}
const ENTITY_ID_FILTER_FIELD: Record<LeaderboardEntityKey, FileViewerFilterField> = {
  division: "divisionId",
  branch: "branchId",
  loanOfficer: "loanOfficerId",
  processor: "processorId",
  underwriter: "underwriterId",
  underwritingOrg: "underwritingOrgId",
}

function toTop20ByPerformance<
  T extends { fileCount: number; totalVolume: number; name: string },
>(rows: T[]) {
  return [...rows]
    .sort((a, b) => {
      if (b.fileCount !== a.fileCount) {
        return b.fileCount - a.fileCount
      }
      if (b.totalVolume !== a.totalVolume) {
        return b.totalVolume - a.totalVolume
      }
      return a.name.localeCompare(b.name)
    })
    .slice(0, 20)
}

type FileViewerUrlFilter = {
  field: FileViewerFilterField
  operator: FileViewerFilterOperator
  value: string
}

function toFileViewerHrefFromFilters(filters: FileViewerUrlFilter[]) {
  if (filters.length === 0) {
    return "/file-viewer"
  }

  const params = new URLSearchParams()
  for (const filter of filters) {
    params.append("ff", filter.field)
    params.append("fo", filter.operator)
    params.append("fv", filter.value)
  }

  return `/file-viewer?${params.toString()}`
}

function toFileViewerHref({
  entity,
  entityId,
  label,
  closedDateStart,
  closedDateEnd,
}: {
  entity: LeaderboardEntityKey
  entityId: string | null
  label: string
  closedDateStart?: string
  closedDateEnd?: string
}) {
  const filters: FileViewerUrlFilter[] = []
  const entityIdField = ENTITY_ID_FILTER_FIELD[entity]
  const entityField = ENTITY_FILTER_FIELD[entity]
  if (entityId?.trim()) {
    filters.push({
      field: entityIdField,
      operator: "equals",
      value: entityId,
    })
  } else if (label.trim()) {
    filters.push({
      field: entityField,
      operator: "equals",
      value: label,
    })
  }
  if (closedDateStart) {
    filters.push({
      field: "closedDate",
      operator: "onOrAfter",
      value: closedDateStart,
    })
  }
  if (closedDateEnd) {
    filters.push({
      field: "closedDate",
      operator: "onOrBefore",
      value: closedDateEnd,
    })
  }

  return toFileViewerHrefFromFilters(filters)
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const googleIdentity = user.identities?.find(
    (identity) => identity.provider === "google"
  )
  const identityData = (googleIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >
  const metadata = user.user_metadata as Record<string, unknown>

  const displayName =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    (identityData.full_name as string | undefined) ??
    (identityData.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there"
  const firstName = displayName.trim().split(/\s+/)[0] || "there"
  const leaderboardReferenceDate = new Date()
  const leaderboardYear = leaderboardReferenceDate.getFullYear()
  const leaderboardMonthIndex = leaderboardReferenceDate.getMonth()
  const leaderboardMonthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(leaderboardReferenceDate)
  const leaderboardMonthLabel = `${leaderboardMonthName} ${leaderboardYear}`
  const leaderboardMonthNumber = String(leaderboardMonthIndex + 1).padStart(2, "0")
  const leaderboardMonthEndDay = new Date(
    leaderboardYear,
    leaderboardMonthIndex + 1,
    0
  ).getDate()
  const leaderboardClosedStart = `${leaderboardYear}-${leaderboardMonthNumber}-01`
  const leaderboardClosedEnd = `${leaderboardYear}-${leaderboardMonthNumber}-${String(
    leaderboardMonthEndDay
  ).padStart(2, "0")}`

  let productionChartError: string | null = null
  let productionSeries: Awaited<
    ReturnType<typeof fetchCanopyProductionSeriesFromRpc>
  > | null = null
  let aprilBranchError: string | null = null
  let aprilBranchSummary: Awaited<
    ReturnType<typeof fetchAprilBranchSummaryFromRpc>
  > = []
  let aprilDivisionError: string | null = null
  let aprilDivisionSummary: Awaited<
    ReturnType<typeof fetchAprilDivisionSummaryFromRpc>
  > = []
  let aprilLoanOfficerError: string | null = null
  let aprilLoanOfficerSummary: Awaited<
    ReturnType<typeof fetchAprilLoanOfficerSummaryFromRpc>
  > = []
  let aprilProcessorError: string | null = null
  let aprilProcessorSummary: Awaited<
    ReturnType<typeof fetchAprilProcessorSummaryFromRpc>
  > = []
  let aprilUnderwriterError: string | null = null
  let aprilUnderwriterSummary: Awaited<
    ReturnType<typeof fetchAprilUnderwriterSummaryFromRpc>
  > = []
  let aprilUnderwritingOrgError: string | null = null
  let aprilUnderwritingOrgSummary: Awaited<
    ReturnType<typeof fetchAprilUnderwritingOrgSummaryFromRpc>
  > = []
  let corporateTurnError: string | null = null
  let corporateTurnSummary: Awaited<
    ReturnType<typeof fetchCorporateTurnSummaryFromRpc>
  > | null = null
  let loanProgramChartError: string | null = null
  let loanProgramChartSummary: Awaited<
    ReturnType<typeof fetchPreviousMonthLoanProgramSummaryFromRpc>
  > | null = null
  let recentNewsletters: NewsletterFileSummary[] = []

  const [
    chartResult,
    aprilDivisionResult,
    aprilBranchResult,
    aprilLoanOfficerResult,
    aprilProcessorResult,
    aprilUnderwriterResult,
    aprilUnderwritingOrgResult,
    corporateTurnResult,
    loanProgramChartResult,
    recentNewslettersResult,
  ] =
    await Promise.allSettled([
      fetchCanopyProductionSeriesFromRpc(),
      fetchAprilDivisionSummaryFromRpc(),
      fetchAprilBranchSummaryFromRpc(),
      fetchAprilLoanOfficerSummaryFromRpc(),
      fetchAprilProcessorSummaryFromRpc(),
      fetchAprilUnderwriterSummaryFromRpc(),
      fetchAprilUnderwritingOrgSummaryFromRpc(),
      fetchCorporateTurnSummaryFromRpc(),
      fetchPreviousMonthLoanProgramSummaryFromRpc(),
      (async () => {
        const { data: files, error } = await supabase.storage
          .from(NEWSLETTER_BUCKET)
          .list("", { limit: 1000 })
        if (error) {
          throw new Error(error.message)
        }

        return (files ?? [])
          .map((file) => parseNewsletterFileName(file.name))
          .filter((file): file is NewsletterFileSummary => file !== null)
          .sort(compareNewsletterFilesDescending)
          .slice(0, 4)
      })(),
    ])

  if (chartResult.status === "fulfilled") {
    productionSeries = chartResult.value
  } else {
    productionChartError = "Data load failed."
  }

  if (aprilDivisionResult.status === "fulfilled") {
    aprilDivisionSummary = aprilDivisionResult.value
  } else {
    aprilDivisionError = "Data load failed."
  }

  if (aprilBranchResult.status === "fulfilled") {
    aprilBranchSummary = aprilBranchResult.value
  } else {
    aprilBranchError = "Data load failed."
  }

  if (aprilLoanOfficerResult.status === "fulfilled") {
    aprilLoanOfficerSummary = aprilLoanOfficerResult.value
  } else {
    aprilLoanOfficerError = "Data load failed."
  }

  if (aprilProcessorResult.status === "fulfilled") {
    aprilProcessorSummary = aprilProcessorResult.value
  } else {
    aprilProcessorError = "Data load failed."
  }

  if (aprilUnderwriterResult.status === "fulfilled") {
    aprilUnderwriterSummary = aprilUnderwriterResult.value
  } else {
    aprilUnderwriterError = "Data load failed."
  }

  if (aprilUnderwritingOrgResult.status === "fulfilled") {
    aprilUnderwritingOrgSummary = aprilUnderwritingOrgResult.value
  } else {
    aprilUnderwritingOrgError = "Data load failed."
  }

  if (corporateTurnResult.status === "fulfilled") {
    corporateTurnSummary = corporateTurnResult.value
  } else {
    corporateTurnError = "Data load failed."
  }

  if (loanProgramChartResult.status === "fulfilled") {
    loanProgramChartSummary = loanProgramChartResult.value
  } else {
    loanProgramChartError = "Data load failed."
  }

  if (recentNewslettersResult.status === "fulfilled") {
    recentNewsletters = recentNewslettersResult.value
  } else {
    recentNewsletters = []
  }

  const topAprilDivisionSummary = toTop20ByPerformance(
    aprilDivisionSummary.map((row) => ({
      id: row.divisionId,
      name: row.divisionName,
      fileCount: row.fileCount,
      totalVolume: row.totalVolume,
      rowHref: row.divisionId ? `/division/${encodeURIComponent(row.divisionId)}` : undefined,
      fileViewerHref: toFileViewerHref({
        entity: "division",
        entityId: row.divisionId,
        label: row.divisionName,
        closedDateStart: leaderboardClosedStart,
        closedDateEnd: leaderboardClosedEnd,
      }),
    }))
  )

  const topAprilBranchSummary = toTop20ByPerformance(
    aprilBranchSummary.map((row) => ({
      id: row.branchId,
      name: row.branchName,
      fileCount: row.fileCount,
      totalVolume: row.totalVolume,
      rowHref: row.branchId ? `/branch/${encodeURIComponent(row.branchId)}` : undefined,
      fileViewerHref: toFileViewerHref({
        entity: "branch",
        entityId: row.branchId,
        label: row.branchName,
        closedDateStart: leaderboardClosedStart,
        closedDateEnd: leaderboardClosedEnd,
      }),
    }))
  )

  const topAprilLoanOfficerSummary = toTop20ByPerformance(
    aprilLoanOfficerSummary.map((row) => ({
      id: row.loanOfficerId,
      name: row.loanOfficerName,
      fileCount: row.fileCount,
      totalVolume: row.totalVolume,
      rowHref: row.loanOfficerId
        ? `/employee/${encodeURIComponent(row.loanOfficerId)}`
        : undefined,
      fileViewerHref: toFileViewerHref({
        entity: "loanOfficer",
        entityId: row.loanOfficerId,
        label: row.loanOfficerName,
        closedDateStart: leaderboardClosedStart,
        closedDateEnd: leaderboardClosedEnd,
      }),
    }))
  )

  const topAprilProcessorSummary = toTop20ByPerformance(
    aprilProcessorSummary.map((row) => ({
      id: row.processorId,
      name: row.processorName,
      fileCount: row.fileCount,
      totalVolume: row.totalVolume,
      rowHref: row.processorId
        ? `/employee/${encodeURIComponent(row.processorId)}`
        : undefined,
      fileViewerHref: toFileViewerHref({
        entity: "processor",
        entityId: row.processorId,
        label: row.processorName,
        closedDateStart: leaderboardClosedStart,
        closedDateEnd: leaderboardClosedEnd,
      }),
    }))
  )

  const topAprilUnderwriterSummary = toTop20ByPerformance(
    aprilUnderwriterSummary.map((row) => ({
      id: row.underwriterId,
      name: row.underwriterName,
      fileCount: row.fileCount,
      totalVolume: row.totalVolume,
      rowHref: row.underwriterId
        ? `/employee/${encodeURIComponent(row.underwriterId)}`
        : undefined,
      fileViewerHref: toFileViewerHref({
        entity: "underwriter",
        entityId: row.underwriterId,
        label: row.underwriterName,
        closedDateStart: leaderboardClosedStart,
        closedDateEnd: leaderboardClosedEnd,
      }),
    }))
  )

  const topAprilUnderwritingOrgSummary = toTop20ByPerformance(
    aprilUnderwritingOrgSummary.map((row) => ({
      id: row.underwritingOrgId,
      name: row.underwritingOrgName,
      fileCount: row.fileCount,
      totalVolume: row.totalVolume,
      fileViewerHref: toFileViewerHref({
        entity: "underwritingOrg",
        entityId: row.underwritingOrgId,
        label: row.underwritingOrgName,
        closedDateStart: leaderboardClosedStart,
        closedDateEnd: leaderboardClosedEnd,
      }),
    }))
  )

  const corporateTurnSections = corporateTurnSummary
    ? [
        ...CORPORATE_TURN_SECTION_ORDER.map((sectionType) => ({
          sectionType,
          label: CORPORATE_TURN_SECTION_LABELS[sectionType] ?? sectionType,
          rows: corporateTurnSummary.tableRows.filter(
            (row) => row.statusType === sectionType
          ),
        })),
        ...[...new Set(corporateTurnSummary.tableRows.map((row) => row.statusType))]
          .filter((sectionType) => !CORPORATE_TURN_SECTION_ORDER.includes(sectionType))
          .map((sectionType) => ({
            sectionType,
            label: CORPORATE_TURN_SECTION_LABELS[sectionType] ?? sectionType,
            rows: corporateTurnSummary.tableRows.filter(
              (row) => row.statusType === sectionType
            ),
          })),
      ].filter((section) => section.rows.length > 0)
    : []

  return (
    <SidebarProvider>
      <AppSidebar activePath="/home" />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Home</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="px-1 py-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Welcome back, {firstName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Monitor production trends, performance, and key operational metrics.
              </p>
            </div>
            <CultureSection />
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold">
                  Canopy Production Last 12 Months
                </h2>
                <a
                  href="/view/canopy-production-last-12-months"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Open Canopy Production Last 12 Months in new tab"
                  title="Open in new tab"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Funded Loans (bar) and Funded Volume (line)
              </p>
              {productionChartError || !productionSeries ? (
                <p className="mt-4 text-sm text-destructive">
                  {productionChartError ?? "Data load failed."}
                </p>
              ) : (
                <div className="mt-4">
                  <CanopyProductionChart
                    labels={productionSeries.labels}
                    monthlyFundedCounts={productionSeries.monthlyFundedCounts}
                    monthlyFundedVolumes={productionSeries.monthlyFundedVolumes}
                  />
                </div>
              )}
            </div>
            <div className="rounded-xl border bg-card p-6 text-card-foreground">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-semibold">Corporate Turn Times</h2>
                <a
                  href="/view/corporate-turn-times"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Open Corporate Turn Times in new tab"
                  title="Open in new tab"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Corporate workflow status metrics and turnaround times.
              </p>
              {corporateTurnError ? (
                <p className="mt-4 text-sm text-destructive">{corporateTurnError}</p>
              ) : !corporateTurnSummary ||
                corporateTurnSummary.tableRows.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No corporate turn time data is available.
                </p>
              ) : (
                <>
                  <div className="mt-4 overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-[2.2fr_repeat(4,minmax(0,1fr))] gap-x-3 border-b bg-muted/10 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <div>Status</div>
                      <div className="text-right">Files In Progress</div>
                      <div className="text-right">Workdays for Files in Progress</div>
                      <div className="text-right">Workdays to Complete for Previous Week</div>
                      <div className="text-right">
                        Workdays to Complete for Previous Month
                      </div>
                    </div>
                    <div className="divide-y">
                      {corporateTurnSections.map((section) => (
                        <div key={section.sectionType}>
                          <div className="bg-muted/20 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            {section.label}
                          </div>
                          <div className="divide-y">
                            {section.rows.map((row) => (
                              <div
                                key={`${section.sectionType}-${row.status}`}
                                className="grid grid-cols-[2.2fr_repeat(4,minmax(0,1fr))] gap-x-3 px-3 py-2 text-sm"
                              >
                                <p className="font-medium">{row.status}</p>
                                <p className="text-right font-mono tabular-nums">
                                  <Link
                                    href={toFileViewerHrefFromFilters([
                                      {
                                        field: "lastStatus",
                                        operator: "equals",
                                        value: row.status,
                                      },
                                      {
                                        field: "closedDate",
                                        operator: "isEmpty",
                                        value: "",
                                      },
                                    ])}
                                    className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                                  >
                                    {WHOLE_NUMBER_FORMATTER.format(row.filesInProgress)}
                                  </Link>
                                </p>
                                <p className="text-right font-mono tabular-nums">
                                  {ONE_DECIMAL_FORMATTER.format(
                                    row.workdaysForFilesInProgress
                                  )}
                                </p>
                                <p className="text-right font-mono tabular-nums">
                                  {ONE_DECIMAL_FORMATTER.format(
                                    row.workdaysToCompleteForPreviousWeek
                                  )}
                                </p>
                                <p className="text-right font-mono tabular-nums">
                                  {ONE_DECIMAL_FORMATTER.format(
                                    row.workdaysToCompleteForPreviousMonth
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-lg border px-3 py-2">
                      <p className="text-muted-foreground">Workdays for LO/LOA Statuses</p>
                      <p className="mt-1 font-mono tabular-nums">
                        {ONE_DECIMAL_FORMATTER.format(
                          corporateTurnSummary.kpis.workdaysForLoLoaStatuses
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border px-3 py-2">
                      <p className="text-muted-foreground">
                        Processing Rushes in the Last 7 Days
                      </p>
                      <p className="mt-1 font-mono tabular-nums">
                        <Link
                          href="/file-viewer"
                          className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        >
                          {WHOLE_NUMBER_FORMATTER.format(
                            corporateTurnSummary.kpis.processingRushesLast7Days
                          )}
                        </Link>
                      </p>
                    </div>
                    <div className="rounded-lg border px-3 py-2">
                      <p className="text-muted-foreground">
                        Underwriting Rushes in the Last 7 Days
                      </p>
                      <p className="mt-1 font-mono tabular-nums">
                        <Link
                          href="/file-viewer"
                          className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        >
                          {WHOLE_NUMBER_FORMATTER.format(
                            corporateTurnSummary.kpis.underwritingRushesLast7Days
                          )}
                        </Link>
                      </p>
                    </div>
                    <div className="rounded-lg border px-3 py-2">
                      <p className="text-muted-foreground">
                        Closing/Funding Rushes in the Last 7 Days
                      </p>
                      <p className="mt-1 font-mono tabular-nums">
                        <Link
                          href="/file-viewer"
                          className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        >
                          {WHOLE_NUMBER_FORMATTER.format(
                            corporateTurnSummary.kpis.closingFundingRushesLast7Days
                          )}
                        </Link>
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="xl:col-span-2 px-1 pt-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {leaderboardMonthName}&apos;s Leaderboard
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ranked funded file count and volume across teams and roles.
                    </p>
                  </div>
                  <a
                    href="/view/month-leaderboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Open ${leaderboardMonthName} Leaderboard in new tab`}
                    title="Open in new tab"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Division</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Funded file count and total funded volume by division.
                </p>
                {aprilDivisionError ? (
                  <p className="mt-4 text-sm text-destructive">{aprilDivisionError}</p>
                ) : topAprilDivisionSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No funded files were found for {leaderboardMonthLabel}.
                  </p>
                ) : (
                  <AprilSummaryTable
                    entityLabel="Division"
                    rows={topAprilDivisionSummary}
                  />
                )}
              </div>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Branch</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Funded file count and total funded volume by branch.
                </p>
                {aprilBranchError ? (
                  <p className="mt-4 text-sm text-destructive">{aprilBranchError}</p>
                ) : topAprilBranchSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No funded files were found for {leaderboardMonthLabel}.
                  </p>
                ) : (
                  <AprilSummaryTable
                    entityLabel="Branch"
                    rows={topAprilBranchSummary}
                  />
                )}
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Loan Officer</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Funded file count and total funded volume by loan officer.
                </p>
                {aprilLoanOfficerError ? (
                  <p className="mt-4 text-sm text-destructive">
                    {aprilLoanOfficerError}
                  </p>
                ) : topAprilLoanOfficerSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No funded files were found for {leaderboardMonthLabel}.
                  </p>
                ) : (
                  <AprilSummaryTable
                    entityLabel="Loan Officer"
                    rows={topAprilLoanOfficerSummary}
                  />
                )}
              </div>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Processor</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Funded file count and total funded volume by processor.
                </p>
                {aprilProcessorError ? (
                  <p className="mt-4 text-sm text-destructive">{aprilProcessorError}</p>
                ) : topAprilProcessorSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No funded files were found for {leaderboardMonthLabel}.
                  </p>
                ) : (
                  <AprilSummaryTable
                    entityLabel="Processor"
                    rows={topAprilProcessorSummary}
                  />
                )}
              </div>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Underwriter</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Funded file count and total funded volume by underwriter.
                </p>
                {aprilUnderwriterError ? (
                  <p className="mt-4 text-sm text-destructive">
                    {aprilUnderwriterError}
                  </p>
                ) : topAprilUnderwriterSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No funded files were found for {leaderboardMonthLabel}.
                  </p>
                ) : (
                  <AprilSummaryTable
                    entityLabel="Underwriter"
                    rows={topAprilUnderwriterSummary}
                  />
                )}
              </div>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Underwriting Org</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Funded file count and total funded volume by underwriting org.
                </p>
                {aprilUnderwritingOrgError ? (
                  <p className="mt-4 text-sm text-destructive">
                    {aprilUnderwritingOrgError}
                  </p>
                ) : topAprilUnderwritingOrgSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No funded files were found for {leaderboardMonthLabel}.
                  </p>
                ) : (
                  <AprilSummaryTable
                    entityLabel="Underwriting Org"
                    rows={topAprilUnderwritingOrgSummary}
                  />
                )}
              </div>
            </div>
          </div>
          <aside className="xl:w-96 xl:shrink-0 xl:pt-[5.75rem]">
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold">Funded Loans by Loan Program</h2>
                  <a
                    href="/view/funded-loans-by-loan-program"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Open Funded Loans by Loan Program in new tab"
                    title="Open in new tab"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Previous month distribution ({loanProgramChartSummary?.monthLabel ?? "—"}).
                </p>
                {loanProgramChartError ? (
                  <p className="mt-4 text-sm text-destructive">{loanProgramChartError}</p>
                ) : !loanProgramChartSummary ||
                  loanProgramChartSummary.rows.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No funded loan program data is available for the previous month.
                  </p>
                ) : (
                  <div className="mt-4">
                    <FundedLoansByProgramPieChart rows={loanProgramChartSummary.rows} />
                  </div>
                )}
              </div>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Helpful Links</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quick access to support, training, and social channels.
                </p>

                <div className="mt-4 space-y-2">
                  {HELPFUL_RESOURCE_LINKS.map((item) =>
                    item.external ? (
                      <a
                        key={item.label}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                      >
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </a>
                    ) : (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="block rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                      >
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </Link>
                    )
                  )}
                </div>

                <div className="mt-4 border-t pt-4">
                  <p className="text-sm font-medium">Social Media</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {SOCIAL_MEDIA_LINKS.map((item) => (
                      <a
                        key={item.label}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                      >
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        <span>{item.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-6 text-card-foreground">
                <h2 className="text-xl font-semibold">Recent Newsletters</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Latest four monthly newsletters.
                </p>
                <div className="mt-4 space-y-2">
                  {recentNewsletters.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No newsletters available.
                    </p>
                  ) : (
                    recentNewsletters.map((newsletter, index) => (
                      <a
                        key={newsletter.fileName}
                        href={`/newsletters/open?file=${encodeURIComponent(newsletter.fileName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                      >
                        <span>{newsletter.label}</span>
                        {index === 0 ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Current
                          </span>
                        ) : null}
                      </a>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
