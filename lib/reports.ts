import { getLeaderboardPostedMonth } from "@/lib/leaderboard-month"

export interface FeaturedReport {
  id: string
  title: string
  description: string
  href: string
}

export function getFeaturedReports(date = new Date()): FeaturedReport[] {
  const currentMonthName = getLeaderboardPostedMonth(date).monthName

  return [
    {
      id: "month-leaderboard",
      title: `${currentMonthName} Leaderboard`,
      description:
        "Compare funded file count and volume across divisions, branches, and roles.",
      href: "/reports/month-leaderboard",
    },
    {
      id: "corporate-turn-times",
      title: "Corporate Turn Times",
      description:
        "Review processing, underwriting, and closing queues from one clean view.",
      href: "/reports/corporate-turn-times",
    },
    {
      id: "canopy-production-last-12-months",
      title: "Production Last 12 Months",
      description:
        "Spot production patterns and month-over-month movement at a glance.",
      href: "/reports/canopy-production-last-12-months",
    },
    {
      id: "funded-loans-by-program",
      title: "Funded Loans by Program",
      description:
        "See the previous month distribution by loan program without extra filtering.",
      href: "/reports/funded-loans-by-loan-program",
    },
    {
      id: "points-team",
      title: "Specialists Points",
      description:
        "Review specialist performance, weekly totals, and monthly point summaries.",
      href: "/reports/specialists-points",
    },
    {
      id: "file-quality",
      title: "File Quality",
      description:
        "Track file quality performance by branch, division, and expected touch targets.",
      href: "/reports/file-quality",
    },
  ]
}
