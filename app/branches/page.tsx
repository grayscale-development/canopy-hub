import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { BranchesTable } from "@/components/branches/branches-table"
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
import { fetchBranchesDirectoryRows } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Branches",
}

export default async function BranchesPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  let loadError: string | null = null
  let rows: Awaited<ReturnType<typeof fetchBranchesDirectoryRows>> = []

  try {
    rows = await fetchBranchesDirectoryRows()
  } catch {
    loadError = "Data load failed."
  }

  return (
    <SidebarProvider>
      <AppSidebar activePath="/branches" />
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
                <BreadcrumbPage>Branches</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="px-1 py-2">
            <h1 className="text-3xl font-semibold tracking-tight">Branches</h1>
          </div>
          {loadError ? (
            <div className="rounded-xl border bg-card p-6 text-sm text-destructive">
              {loadError}
            </div>
          ) : (
            <BranchesTable rows={rows} />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
