"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWikiChatModal } from "@/components/wiki/wiki-chat-modal"

function searchWords(pathname: string) {
  return pathname
    .replace(/^\/wiki\/?/, "")
    .split("/")
    .flatMap((segment) => {
      try {
        return decodeURIComponent(segment).split(/[-_/\s]+/)
      } catch {
        return segment.split(/[-_/\s]+/)
      }
    })
    .filter((word) => word && !/^\d+$/.test(word))
    .slice(0, 8)
    .join(" ")
}

export default function WikiNotFound() {
  const pathname = usePathname()
  const { openWithPrompt } = useWikiChatModal()

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-white dark:bg-[#1F1F1F]">
      <section className="mx-auto flex w-full max-w-[864px] flex-col gap-6 px-6 py-6 md:px-8 md:py-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold">
            This link is out of date or the page was removed
          </h1>
          <p className="text-muted-foreground">
            Try searching for the page, or return to the wiki home.
          </p>
        </div>
        <form
          key={pathname}
          className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            openWithPrompt(
              String(new FormData(event.currentTarget).get("search") ?? "")
            )
          }}
        >
          <div className="flex-1 space-y-2">
            <label htmlFor="wiki-search" className="text-sm font-medium">
              Search with Milo
            </label>
            <Input
              id="wiki-search"
              name="search"
              defaultValue={searchWords(pathname)}
              placeholder="Enter a page name"
            />
          </div>
          <Button type="submit" className="bg-sidebar-primary">
            Search
          </Button>
        </form>
        <div>
          <Button asChild variant="outline">
            <Link href="/wiki">Go to wiki home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
