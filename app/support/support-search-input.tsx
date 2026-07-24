"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function buildSupportSearchHref({
  query,
  editMode,
}: {
  query: string
  editMode: boolean
}) {
  const params = new URLSearchParams()
  const trimmedQuery = query.trim()

  if (trimmedQuery) {
    params.set("q", trimmedQuery)
  }
  if (editMode) {
    params.set("edit", "1")
  }

  const suffix = params.toString()
  return suffix ? `/support?${suffix}` : "/support"
}

export function SupportSearchInput({
  initialQuery,
  editMode,
}: {
  initialQuery: string
  editMode: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    if (value.trim() === initialQuery.trim()) {
      return
    }

    const timeout = window.setTimeout(() => {
      startTransition(() => {
        router.replace(
          buildSupportSearchHref({
            query: value,
            editMode,
          }),
          { scroll: false }
        )
      })
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [editMode, initialQuery, router, value])

  function clearSearch() {
    setValue("")
    startTransition(() => {
      router.replace(
        buildSupportSearchHref({
          query: "",
          editMode,
        }),
        { scroll: false }
      )
    })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-2 sm:flex-row">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by department, inbox, name, or phone"
        className="min-h-12 bg-white text-slate-950 placeholder:text-slate-500 focus-visible:border-white focus-visible:ring-white/60"
        aria-label="Search support directory"
      />
      {value ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-12 border-white/35 bg-white text-slate-950 hover:bg-white/90 focus-visible:ring-white/60 sm:w-24"
          onClick={clearSearch}
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
