import { DepartmentReportPage } from "@/components/department-dashboard/department-report-page"

export const metadata = {
  title: "Underwriting",
}

export default function UnderwritingReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <DepartmentReportPage
      department="underwriting"
      searchParams={searchParams}
    />
  )
}
