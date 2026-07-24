import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  BadgeDollarSignIcon,
  CompassIcon,
  CpuIcon,
  HandHeartIcon,
  HandshakeIcon,
  LightbulbIcon,
  ScaleIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaYoutube,
} from "react-icons/fa"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Home",
}

const BRIDGE_LOGIN_URL = "https://canopymortgage.bridgeapp.com/login"
const CANOPY_WIKI_URL =
  "https://sites.google.com/canopymortgage.com/trainingwiki/home?authuser=0"

const QUICK_ACTIONS = [
  {
    label: "Pipeline",
    description: "See active work and where each file stands.",
    href: "/pipeline",
  },
  {
    label: "Find a File",
    description: "Search loan files without digging through systems.",
    href: "/file-viewer",
  },
  {
    label: "View Reports",
    description:
      "Open leaderboards, production, file quality, points, and turn-time views.",
    href: "/reports",
  },
  {
    label: "Find People",
    description: "Look up teammates, departments, and contact details.",
    href: "/employee-directory",
  },
  {
    label: "Branches",
    description: "Browse branch locations and related production views.",
    href: "/branches",
  },
  {
    label: "Documents",
    description: "Open shared documents, policies, newsletters, and floor plans.",
    href: "/documents",
  },
] as const

const HELPFUL_RESOURCE_LINKS = [
  {
    label: "Canopy Wiki",
    description: "Training, process guides, and team reference material.",
    href: CANOPY_WIKI_URL,
    external: true,
    image: "/training-wiki.jpg",
  },
  {
    label: "Department Directory",
    description: "Find the right group when you need help.",
    href: "/support",
    external: false,
    image: "/department-directory.png",
  },
  {
    label: "Compliment Your Team",
    description: "Send recognition when someone makes the work easier.",
    href: "https://docs.google.com/forms/d/e/1FAIpQLSd8FR2h37lG3e64t9_qNIoAn6qkUQaiycSyTzrGQO4unHaceA/viewform",
    external: true,
    image: "/compliment-employee.jpg",
  },
] as const

const SOCIAL_MEDIA_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/canopy.mortgage",
    icon: FaInstagram,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/canopy-mortgage",
    icon: FaLinkedinIn,
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@canopymortgage",
    icon: FaYoutube,
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/people/CanopyMortgage/61555767074405",
    icon: FaFacebookF,
  },
] as const

const MISSION_POINTS = [
  {
    label: "Better Tech",
    description: "Tools that make the next step clear.",
    icon: CpuIcon,
  },
  {
    label: "Better Pricing",
    description: "Fast access to the numbers teams rely on.",
    icon: BadgeDollarSignIcon,
  },
  {
    label: "Better Relationships",
    description: "Shared context for better handoffs.",
    icon: HandshakeIcon,
  },
] as const

const COMPANY_VALUES = [
  {
    title: "Do more with less",
    description:
      "We utilize the resources we already have at our disposal to drive success. Sometimes it means we dig deep and look for outside-the-box solutions to achieve desired outcomes.",
    icon: ScaleIcon,
  },
  {
    title: "Act like an owner",
    description:
      "We own our roles and our decisions. When faced with a challenge, we consider all the options in the context of moving the organization towards success. We also own our mistakes, learn from them, and keep going.",
    icon: CompassIcon,
  },
  {
    title: "Find opportunities to serve",
    description:
      "Be it a stranger, a coworker, a customer, a loved one, or even ourselves, we look for chances to extend a helping hand when someone is in need.",
    icon: HandHeartIcon,
  },
  {
    title: "Seek to understand",
    description:
      "We all want to be heard. When we seek to understand, we affirm what the other person has said. We listen. We value the other person and their point of view.",
    icon: SearchIcon,
  },
  {
    title: "Be a disruptive innovator",
    description: "We challenge how we do something.",
    icon: LightbulbIcon,
  },
  {
    title: "Be kind",
    description:
      "We act generously with a concern for others without expecting praise or reward in return.",
    icon: SparklesIcon,
  },
] as const

function HowWeWorkDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-white/35 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none">
          Learn more
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] w-[min(94vw,58rem)] overflow-y-auto p-0">
        <div className="px-6 pt-7 pb-5 sm:px-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold tracking-tight">
              Building a better mortgage experience
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="space-y-8 px-6 pb-7 sm:px-8">
          <section>
            <div className="text-sm font-semibold text-muted-foreground uppercase">
              Mission
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {MISSION_POINTS.map((point) => (
                <div
                  key={point.label}
                  className="rounded-lg border bg-muted/20 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                      <point.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold tracking-tight">
                      {point.label}
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div>
              <p className="text-sm font-semibold text-muted-foreground uppercase">
                Values
              </p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {COMPANY_VALUES.map((value) => (
                <div key={value.title} className="flex gap-3 rounded-lg border p-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <value.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{value.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {value.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActionCard({
  label,
  description,
  href,
}: {
  label: string
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group block min-h-32 rounded-lg border bg-card p-5 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <h3 className="text-lg font-semibold">{label}</h3>
      <p className="mt-2 max-w-[28ch] text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </Link>
  )
}

function ResourceCard({
  label,
  description,
  href,
  external,
  image,
}: {
  label: string
  description: string
  href: string
  external: boolean
  image: string
}) {
  const content = (
    <>
      <div className="relative aspect-[16/9] overflow-hidden rounded-t-lg bg-muted">
        <Image
          src={image}
          alt=""
          fill
          sizes="(min-width: 1280px) 360px, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-semibold">{label}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </>
  )

  const className =
    "group flex min-h-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const googleIdentity = user.identities?.find(
    (identity) => identity.provider === "google"
  )
  const identityData = (googleIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >
  const metadata = user.user_metadata as Record<string, unknown>

  const displayName =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    (identityData.full_name as string | undefined) ??
    (identityData.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there"
  const firstName = displayName.trim().split(/\s+/)[0] || "there"

  let recentNewsletters: NewsletterFileSummary[] = []
  try {
    const { data: files, error } = await supabase.storage
      .from(NEWSLETTER_BUCKET)
      .list("", { limit: 1000 })
    if (error) {
      throw new Error(error.message)
    }

    recentNewsletters = (files ?? [])
      .map((file) => parseNewsletterFileName(file.name))
      .filter((file): file is NewsletterFileSummary => file !== null)
      .sort(compareNewsletterFilesDescending)
      .slice(0, 4)
  } catch {
    recentNewsletters = []
  }

  const currentNewsletter = recentNewsletters[0] ?? null

  return (
    <SidebarProvider>
      <AppSidebar activePath="/home" />
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
                <BreadcrumbPage>Home</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 p-4 md:p-6">
          <section className="relative overflow-hidden rounded-lg bg-foreground text-white shadow-sm">
            <Image
              src="/background-subdivision.jpg"
              alt=""
              fill
              sizes="(min-width: 1280px) 1280px, 100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-black/60 dark:bg-black/70" />
            <div className="relative grid min-h-[340px] gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-10">
              <div className="flex max-w-2xl flex-col justify-center">
                <h1 className="text-4xl leading-[1.05] font-semibold md:text-5xl">
                  Welcome back, {firstName}
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/75">
                  Everything your team reaches for most is organized here, with
                  clear paths into files, reports, people, and support.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href={CANOPY_WIKI_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
                  >
                    Canopy Wiki
                  </a>
                  <Link
                    href="/support"
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-white/35 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
                  >
                    Department Directory
                  </Link>
                </div>
              </div>
              <div className="flex flex-col justify-center border-t border-white/20 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Image
                      src="/canopy-logo-cube-100.png"
                      alt="Canopy Mortgage"
                      width={40}
                      height={40}
                      className="h-10 w-10 object-contain"
                      priority
                    />
                    <h2 className="text-lg font-semibold">How We Work</h2>
                  </div>
                  <HowWeWorkDialog />
                </div>
                <div className="mt-5 grid gap-4">
                  {MISSION_POINTS.map((point) => (
                    <div key={point.label}>
                      <h3 className="text-sm font-semibold">{point.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-white/70">
                        {point.description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-5 border-t border-white/20 pt-4 text-sm font-medium text-white/75">
                  Better relationships carry the work.
                </p>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">Helpful Resources</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {HELPFUL_RESOURCE_LINKS.map((item) => (
                <ResourceCard key={item.label} {...item} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Tools</h2>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {QUICK_ACTIONS.map((action) => (
                <ActionCard key={action.label} {...action} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">Connect</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <a
                href={BRIDGE_LOGIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-56 flex-col rounded-lg border bg-card p-5 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:p-6"
              >
                <div>
                  <h3 className="text-2xl font-semibold">Bridge</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Open Canopy&apos;s learning and development hub for courses,
                    skills, performance, and reporting.
                  </p>
                </div>
              </a>

              <div className="flex min-h-56 flex-col rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
                <div>
                  <h3 className="text-2xl font-semibold">Social</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Open the official Canopy channels for brand posts, videos,
                    and company updates.
                  </p>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
                  {SOCIAL_MEDIA_LINKS.map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-10 items-center gap-2.5 rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <item.icon aria-hidden="true" className="size-4" />
                      <span>{item.label}</span>
                    </a>
                  ))}
                </div>
              </div>

              {currentNewsletter ? (
                <a
                  href={`/newsletters/open?file=${encodeURIComponent(currentNewsletter.fileName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-56 flex-col rounded-lg border bg-card p-5 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold">Newsletters</h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Read the latest team notes and monthly announcements.
                      </p>
                    </div>
                    <span className="rounded-md border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                      Current
                    </span>
                  </div>
                  <div className="mt-auto border-t pt-5">
                    <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Current issue
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {currentNewsletter.label}
                    </p>
                  </div>
                </a>
              ) : (
                <div className="flex min-h-56 flex-col rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
                  <div>
                    <h3 className="text-2xl font-semibold">Newsletters</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Read the latest team notes and monthly announcements.
                    </p>
                  </div>
                  <div className="mt-auto border-t pt-5">
                    <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Current issue
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      No newsletters available.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
