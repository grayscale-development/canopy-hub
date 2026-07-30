import Image from "next/image"
import { redirect } from "next/navigation"

import { NewsletterUploadButton } from "@/components/newsletters/newsletter-upload-button"
import { NewslettersPageContent } from "@/components/newsletters/newsletters-page-content"
import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { PermissionRequestGate } from "@/components/permissions/permission-request-gate"
import { Button } from "@/components/ui/button"
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
  compareNewsletterFilesDescending,
  NEWSLETTER_BUCKET,
  parseNewsletterFileName,
  type NewsletterFileSummary,
} from "@/lib/newsletters"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { UploadIcon } from "lucide-react"

export const metadata = {
  title: "Newsletters",
}

export default async function NewslettersPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const canUpload = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: "newsletters.upload",
  })

  let newsletters: NewsletterFileSummary[] = []
  try {
    const { data: files, error } = await supabase.storage
      .from(NEWSLETTER_BUCKET)
      .list("", { limit: 1000 })

    if (error) {
      throw new Error(error.message)
    }

    newsletters = (files ?? [])
      .map((file) => parseNewsletterFileName(file.name))
      .filter((file): file is NewsletterFileSummary => file !== null)
      .sort(compareNewsletterFilesDescending)
  } catch {
    newsletters = []
  }

  return (
    <SidebarProvider>
      <AppSidebar activePath="/newsletters" />
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
                <BreadcrumbPage>Newsletters</BreadcrumbPage>
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
                  Newsletters
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/75">
                  Browse company newsletter PDFs by year and open any monthly
                  issue.
                </p>
              </div>
              <div className="shrink-0">
                {canUpload ? (
                  <NewsletterUploadButton
                    newsletters={newsletters}
                    triggerClassName="border-white/35 bg-white text-slate-950 hover:bg-white/90 focus-visible:ring-white/60"
                  />
                ) : (
                  <PermissionRequestGate
                    hasPermission={canUpload}
                    permissionCode="newsletters.upload"
                    permissionName="Upload Newsletters"
                    popupClassName="right-0 left-auto text-slate-950"
                  >
                    <Button
                      type="button"
                      size="sm"
                      className="border-white/35 bg-white text-slate-950 hover:bg-white/90 focus-visible:ring-white/60"
                    >
                      <UploadIcon />
                      Upload
                    </Button>
                  </PermissionRequestGate>
                )}
              </div>
            </div>
          </section>

          <NewslettersPageContent newsletters={newsletters} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
