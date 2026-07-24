import Image from "next/image"
import { redirect } from "next/navigation"

import { DocumentsGrid } from "@/components/documents/documents-grid"
import { DocumentUploadDialog } from "@/components/documents/document-upload-buttons"
import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
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
import { userHasPermissionCode } from "@/lib/permissions"
import {
  POLICIES_BUCKET,
  POLICIES_MANAGE_PERMISSION,
  stripPolicyFileExtension,
  type PolicyFileSummary,
} from "@/lib/policies"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function DocumentsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const canManagePolicies = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: POLICIES_MANAGE_PERMISSION,
  })

  let policies: PolicyFileSummary[] = []

  try {
    const { data: files, error } = await supabase.storage
      .from(POLICIES_BUCKET)
      .list("", { limit: 1000 })

    if (error) {
      throw new Error(error.message)
    }

    policies = (files ?? [])
      .filter((file) => Boolean(file.name?.trim()))
      .map((file) => ({
        fileName: file.name,
        displayName: stripPolicyFileExtension(file.name),
      }))
      .sort((left, right) => {
        const labelCompare = left.displayName.localeCompare(
          right.displayName,
          undefined,
          {
            sensitivity: "base",
          }
        )
        if (labelCompare !== 0) {
          return labelCompare
        }
        return left.fileName.localeCompare(right.fileName, undefined, {
          sensitivity: "base",
        })
      })
  } catch {
    policies = []
  }

  return (
    <SidebarProvider>
      <AppSidebar activePath="/documents" />
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
                <BreadcrumbPage>Documents</BreadcrumbPage>
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
                  Documents
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/75">
                  Browse and open shared company documents from one place.
                </p>
              </div>
              <div className="shrink-0">
                <DocumentUploadDialog
                  canManagePolicies={canManagePolicies}
                  triggerClassName="border-white/35 bg-white text-slate-950 hover:bg-white/90 focus-visible:ring-white/60"
                />
              </div>
            </div>
          </section>

          <section>
            <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
              <div>
                <h2 className="text-2xl font-semibold">All Documents</h2>
              </div>

              {policies.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No documents are available yet.
                </div>
              ) : (
                <DocumentsGrid
                  policies={policies}
                  canManagePolicies={canManagePolicies}
                />
              )}
            </div>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
