import { DepartmentReportPage } from "@/components/department-dashboard/department-report-page"

export const metadata = {
  title: "Processing",
}

export default function ProcessingReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <DepartmentReportPage department="processing" searchParams={searchParams} />
  )
}
