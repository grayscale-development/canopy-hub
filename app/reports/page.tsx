import Image from "next/image"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { ReportsShuffleButton } from "@/components/reports/reports-shuffle-button"
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
import { getFeaturedReports } from "@/lib/reports"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Reports",
}

function ReportCard({
  title,
  description,
  href,
}: {
  title: string
  description: string
  href: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block min-h-44 rounded-lg border bg-card p-5 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-2 max-w-[42ch] text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </a>
  )
}

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const featuredReports = getFeaturedReports()

  return (
    <SidebarProvider>
      <AppSidebar activePath="/reports" />
      <SidebarInset className="min-w-0 overflow-x-hidden bg-muted/20">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Reports</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 p-4 md:p-6">
          <section className="relative overflow-hidden rounded-lg bg-foreground p-6 text-white shadow-sm md:p-8">
            <Image
              src="/background-subdivision.jpg"
              alt=""
              fill
              sizes="(min-width: 1280px) 1280px, 100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-black/60 dark:bg-black/70" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-4xl leading-[1.08] font-semibold md:text-5xl">
                  Reports
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/75">
                  Choose a focused view for production, turn times, file
                  quality, specialists points, and loan program trends.
                </p>
              </div>
              <div className="shrink-0">
                <ReportsShuffleButton reports={featuredReports} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            {featuredReports.map((report) => (
              <ReportCard key={report.title} {...report} />
            ))}
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
