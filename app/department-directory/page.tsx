import Image from "next/image"
import { InfoIcon, PencilIcon } from "lucide-react"
import { redirect } from "next/navigation"

import {
  AddSectionActionsMenu,
  ContactActionsMenu,
  EntryActionsMenu,
  SectionActionsMenu,
} from "@/app/department-directory/action-menus"
import { CopyEmailButton } from "@/app/department-directory/copy-email-button"
import { SupportSearchInput } from "@/app/department-directory/support-search-input"
import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { PermissionRequestGate } from "@/components/permissions/permission-request-gate"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { userHasPermissionCode } from "@/lib/permissions"
import {
  fetchSupportDirectoryData,
  type SupportDirectoryContact,
  type SupportDirectoryItem,
  type SupportDirectorySection,
} from "@/lib/support-directory-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "Directory",
}

const SUPPORT_PAGE_TITLE = "Department Directory"
const SUPPORT_POLICY_TITLE = "Inbox Routing Policy"
const SUPPORT_POLICY_BODY =
  "Please refrain from cc'ing an individual on a group email if they are listed as someone who manages the inbox. This is especially important for all rush request inboxes."

function toTelHref(phone: string) {
  const normalized = phone.replace(/[^0-9+]/g, "")
  return `tel:${normalized}`
}

function firstSearchParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

function matchesText(value: string | null | undefined, query: string) {
  if (!value) {
    return false
  }

  return value.toLowerCase().includes(query)
}

function itemMatchesQuery(item: SupportDirectoryItem, query: string) {
  if (matchesText(item.title, query) || matchesText(item.description, query)) {
    return true
  }

  if (
    item.emails.some((email) => matchesText(email, query)) ||
    matchesText(item.monitoredBy, query) ||
    item.notes.some((note) => matchesText(note, query))
  ) {
    return true
  }

  return item.contacts.some((contact) => {
    return (
      matchesText(contact.name, query) ||
      matchesText(contact.role, query) ||
      matchesText(contact.phone, query) ||
      matchesText(contact.email, query)
    )
  })
}

function filterSectionByQuery(
  section: SupportDirectorySection,
  query: string
): SupportDirectorySection | null {
  if (!query) {
    return section
  }

  const sectionMatches =
    matchesText(section.title, query) ||
    matchesText(section.description, query) ||
    matchesText(section.managerName, query) ||
    matchesText(section.managerPhone, query) ||
    section.notes.some((note) => matchesText(note, query))

  const matchingItems = section.items.filter((item) =>
    itemMatchesQuery(item, query)
  )

  if (!sectionMatches && matchingItems.length === 0) {
    return null
  }

  return {
    ...section,
    items: sectionMatches ? section.items : matchingItems,
  }
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null
}

function buildSupportHref({
  query,
  editMode,
}: {
  query: string
  editMode: boolean
}) {
  const params = new URLSearchParams()
  if (query) {
    params.set("q", query)
  }
  if (editMode) {
    params.set("edit", "1")
  }

  const suffix = params.toString()
  return suffix ? `/department-directory?${suffix}` : "/department-directory"
}

function ContactDetails({
  contact,
  editable = false,
}: {
  contact: SupportDirectoryContact
  editable?: boolean
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{contact.name}</p>
          {contact.role ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {contact.role}
            </p>
          ) : null}
        </div>
        {editable ? <ContactActionsMenu contact={contact} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {contact.phone ? (
          <a
            href={toTelHref(contact.phone)}
            className="inline-flex min-h-8 items-center rounded-md border bg-background px-2.5 text-xs font-medium text-primary underline-offset-4 hover:bg-muted hover:underline"
          >
            {contact.phone}
          </a>
        ) : null}
        {contact.email ? <CopyEmailButton email={contact.email} /> : null}
      </div>
    </div>
  )
}

function MetadataInfoButton({
  monitoredBy,
  notes,
  contacts,
}: {
  monitoredBy?: string | null
  notes?: string[]
  contacts?: SupportDirectoryContact[]
}) {
  const visibleNotes = notes ?? []
  const visibleContacts = contacts ?? []

  if (
    !monitoredBy &&
    visibleNotes.length === 0 &&
    visibleContacts.length === 0
  ) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Show support details"
        >
          <InfoIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm text-left leading-5">
        {monitoredBy ? (
          <p>
            <span className="font-medium">Monitored by:</span> {monitoredBy}
          </p>
        ) : null}
        {visibleNotes.length ? (
          <div className="mt-2">
            <p className="font-medium">Notes</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {visibleNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {visibleContacts.length ? (
          <div className="mt-2">
            <p className="font-medium">Contacts</p>
            <div className="mt-1 grid gap-1.5">
              {visibleContacts.map((contact) => (
                <div key={contact.id}>
                  <p className="font-medium">{contact.name}</p>
                  {contact.role ? <p>{contact.role}</p> : null}
                  {contact.phone ? <p>{contact.phone}</p> : null}
                  {contact.email ? <p>{contact.email}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

function DirectoryItemCard({
  item,
  editable = false,
}: {
  item: SupportDirectoryItem
  editable?: boolean
}) {
  const hasDescription = Boolean(item.description)

  return (
    <div className="rounded-lg border bg-background px-3 py-2.5 shadow-xs transition-colors hover:bg-muted/20">
      <div
        className={cn(
          "grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]",
          hasDescription ? "lg:items-start" : "lg:items-center"
        )}
      >
        <div className={cn("min-w-0", hasDescription ? "space-y-1" : null)}>
          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
          {item.description ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:justify-end">
          {item.emails.map((email) => (
            <CopyEmailButton key={email} email={email} />
          ))}
          <MetadataInfoButton
            monitoredBy={item.monitoredBy}
            notes={item.notes}
            contacts={item.contacts}
          />
          {editable ? <EntryActionsMenu item={item} /> : null}
        </div>
      </div>

      {editable && item.contacts.length ? (
        <div className="mt-2 grid gap-2 border-t pt-2">
          {item.contacts.map((contact) => (
            <ContactDetails
              key={contact.id}
              contact={contact}
              editable={editable}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SectionControlRow({
  section,
  editable = false,
}: {
  section: SupportDirectorySection
  editable?: boolean
}) {
  if (!editable) {
    return null
  }

  return <SectionActionsMenu section={section} />
}

function DepartmentSection({
  department,
  editable = false,
  openByDefault = false,
}: {
  department: SupportDirectorySection
  editable?: boolean
  openByDefault?: boolean
}) {
  return (
    <details
      open={openByDefault}
      className="group overflow-hidden rounded-lg border bg-background text-foreground shadow-xs"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50 md:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{department.title}</h3>
          {department.managerName || department.managerPhone ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {department.managerName ? department.managerName : null}
              {department.managerName && department.managerPhone ? " · " : null}
              {department.managerPhone ? (
                <a
                  href={toTelHref(department.managerPhone)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {department.managerPhone}
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium text-muted-foreground">
          <span className="group-open:hidden">View details</span>
          <span className="hidden group-open:inline">Hide details</span>
        </div>
      </summary>

      <div className="border-t p-4 md:p-5">
        {editable ? (
          <div className="mb-4 flex justify-end">
            <SectionControlRow section={department} editable />
          </div>
        ) : null}

        {department.notes.length ? (
          <ul className="mb-4 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
            {department.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {department.items.map((item) => (
            <DirectoryItemCard key={item.id} item={item} editable={editable} />
          ))}
        </div>
      </div>
    </details>
  )
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const canEditSupport = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: "department-directory.edit",
  })

  const resolvedSearchParams = (await searchParams) ?? {}
  const queryText = (firstSearchParam(resolvedSearchParams.q) ?? "").trim()
  const query = queryText.toLowerCase()
  const requestedEditMode =
    (firstSearchParam(resolvedSearchParams.edit) ?? "") === "1"
  const isEditMode = requestedEditMode && canEditSupport

  let loadError: string | null = null
  let directoryData: Awaited<
    ReturnType<typeof fetchSupportDirectoryData>
  > | null = null

  try {
    directoryData = await fetchSupportDirectoryData()
  } catch {
    loadError = "Data load failed."
  }

  const filteredGeneralHelpSection = directoryData?.generalHelpSection
    ? filterSectionByQuery(directoryData.generalHelpSection, query)
    : null
  const filteredRushSections = (directoryData?.rushSections ?? [])
    .map((section) => filterSectionByQuery(section, query))
    .filter(isNotNull)
  const filteredDepartments = (directoryData?.departments ?? [])
    .map((section) => filterSectionByQuery(section, query))
    .filter(isNotNull)
  const hasSearchResults =
    !query ||
    Boolean(filteredGeneralHelpSection) ||
    filteredRushSections.length > 0 ||
    filteredDepartments.length > 0
  const shouldOpenDepartmentDetails = Boolean(query) || isEditMode

  return (
    <SidebarProvider>
      <AppSidebar activePath="/department-directory" />
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
                <BreadcrumbPage>Directory</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
          <section className="relative overflow-hidden rounded-lg bg-foreground p-5 text-white shadow-sm md:p-6">
            <Image
              src="/department-directory.png"
              alt=""
              fill
              sizes="(min-width: 1280px) 1280px, 100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-black/65 dark:bg-black/75" />
            <div className="relative flex flex-col gap-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <h1 className="text-3xl leading-tight font-semibold md:text-4xl">
                    {SUPPORT_PAGE_TITLE}
                  </h1>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {canEditSupport ? (
                    <Button
                      asChild
                      variant={isEditMode ? "default" : "outline"}
                      size="sm"
                      className="border-white/35 bg-white text-slate-950 hover:bg-white/90 focus-visible:ring-white/60"
                    >
                      <a
                        href={buildSupportHref({
                          query: queryText,
                          editMode: !isEditMode,
                        })}
                      >
                        <PencilIcon />
                        {isEditMode ? "Done Editing" : "Edit Content"}
                      </a>
                    </Button>
                  ) : (
                    <PermissionRequestGate
                      hasPermission={canEditSupport}
                      permissionCode="department-directory.edit"
                      permissionName="Edit Support Page"
                      popupClassName="right-0 left-auto text-slate-950"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-white/35 bg-white text-slate-950 hover:bg-white/90 focus-visible:ring-white/60"
                      >
                        <PencilIcon />
                        Edit Content
                      </Button>
                    </PermissionRequestGate>
                  )}
                  {isEditMode ? (
                    <AddSectionActionsMenu triggerClassName="border-white/35 bg-white text-slate-950 hover:bg-white/90 focus-visible:ring-white/60" />
                  ) : null}
                </div>
              </div>
              <div className="max-w-3xl">
                <SupportSearchInput
                  initialQuery={queryText}
                  editMode={isEditMode}
                />
              </div>
            </div>
          </section>

          {isEditMode ? (
            <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-sm">
              Edit mode is on. Sections are expanded so each content area can be
              managed in place.
            </section>
          ) : null}

          {loadError || !directoryData ? (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              {loadError}
            </div>
          ) : (
            <>
              {filteredGeneralHelpSection ? (
                <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-semibold">
                          {filteredGeneralHelpSection.title}
                        </h2>
                      </div>
                      <SectionControlRow
                        section={filteredGeneralHelpSection}
                        editable={isEditMode}
                      />
                    </div>
                    {filteredGeneralHelpSection.items.length ? (
                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        {filteredGeneralHelpSection.items.map((item) => (
                          <DirectoryItemCard
                            key={item.id}
                            item={item}
                            editable={isEditMode}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        No general help entry configured.
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
                    <h2 className="text-2xl font-semibold">
                      {SUPPORT_POLICY_TITLE}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {SUPPORT_POLICY_BODY}
                    </p>
                  </div>
                </section>
              ) : null}

              {filteredRushSections.length ? (
                <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
                  <div className="max-w-2xl">
                    <h2 className="text-2xl font-semibold">
                      Rush Request Inboxes
                    </h2>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filteredRushSections.map((section) => {
                      const firstItem = section.items[0] ?? null
                      const managedBy =
                        section.managerName ?? firstItem?.monitoredBy ?? null
                      const description =
                        section.description ?? firstItem?.description ?? null
                      const hasDescription = Boolean(description)
                      const emails = [
                        ...new Set(
                          section.items.flatMap((item) => item.emails)
                        ),
                      ]

                      return (
                        <div
                          key={section.id}
                          className="rounded-lg border bg-background px-3 py-2.5 shadow-xs transition-colors hover:bg-muted/20"
                        >
                          <div
                            className={cn(
                              "grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]",
                              hasDescription
                                ? "lg:items-start"
                                : "lg:items-center"
                            )}
                          >
                            <div
                              className={cn(
                                "min-w-0",
                                hasDescription ? "space-y-1" : null
                              )}
                            >
                              <h3 className="truncate text-sm font-semibold">
                                {section.title}
                              </h3>
                              {description ? (
                                <p className="text-sm leading-5 text-muted-foreground">
                                  {description}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:justify-end">
                              {emails.map((email) => (
                                <CopyEmailButton
                                  key={`${section.id}-${email}`}
                                  email={email}
                                />
                              ))}
                              <MetadataInfoButton monitoredBy={managedBy} />
                              <SectionControlRow
                                section={section}
                                editable={isEditMode}
                              />
                            </div>
                          </div>

                          {isEditMode && section.items.length ? (
                            <div className="mt-2 grid gap-2 border-t pt-2">
                              {section.items.map((item) => (
                                <DirectoryItemCard
                                  key={item.id}
                                  item={item}
                                  editable
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ) : null}

              {!hasSearchResults ? (
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                  No support matches found for “{queryText}”.
                </div>
              ) : null}

              {filteredDepartments.length ? (
                <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="max-w-2xl">
                      <h2 className="text-2xl font-semibold">Departments</h2>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3">
                    {filteredDepartments.map((department) => (
                      <DepartmentSection
                        key={department.id}
                        department={department}
                        editable={isEditMode}
                        openByDefault={shouldOpenDepartmentDetails}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
