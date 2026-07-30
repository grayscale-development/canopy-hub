import { redirect } from "next/navigation"

export const metadata = {
  title: "Office Floor Plan",
}

export default function OfficeFloorPlanPage() {
  redirect("/home")
}
