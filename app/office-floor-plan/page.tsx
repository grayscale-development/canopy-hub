import { redirect } from "next/navigation"

export const metadata = {
  title: "Documents",
}

export default function OfficeFloorPlanPage() {
  redirect("/documents")
}
