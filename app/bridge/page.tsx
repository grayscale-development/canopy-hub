import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
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
import { createSupabaseServerClient } from "@/lib/supabase/server"

const BRIDGE_LOGIN_URL = "https://canopymortgage.bridgeapp.com/login"

export const metadata = {
  title: "Bridge",
}

export default async function BridgePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <SidebarProvider>
      <AppSidebar activePath="/bridge" />
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
                <BreadcrumbPage>Bridge</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="px-1 py-2">
            <h1 className="text-3xl font-semibold tracking-tight">Bridge</h1>
          </div>
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">
            <p>
              Bridge is Canopy&apos;s learning and development hub for courses,
              skills, performance, and reporting. It opens on its own site.
            </p>
            <a
              href={BRIDGE_LOGIN_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open Bridge
            </a>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
