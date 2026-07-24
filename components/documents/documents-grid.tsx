"use client"

import { SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { PolicyDeleteButton } from "@/components/documents/policy-delete-button"
import { PolicyRenameButton } from "@/components/documents/policy-rename-button"
import { Input } from "@/components/ui/input"
import type { PolicyFileSummary } from "@/lib/policies"

function toPolicyOpenHref(fileName: string) {
  return `/policies/open?file=${encodeURIComponent(fileName)}`
}

export function DocumentsGrid({
  policies,
  canManagePolicies,
}: {
  policies: PolicyFileSummary[]
  canManagePolicies: boolean
}) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filteredPolicies = useMemo(() => {
    if (!normalizedQuery) {
      return policies
    }

    return policies.filter((policy) =>
      policy.displayName.toLowerCase().includes(normalizedQuery)
    )
  }, [normalizedQuery, policies])

  return (
    <div className="mt-6">
      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents"
          className="pl-9"
        />
      </div>

      {filteredPolicies.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No documents match your search.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPolicies.map((policy) => (
            <div key={policy.fileName} className="group relative">
              <a
                href={toPolicyOpenHref(policy.fileName)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-20 items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 pr-24 text-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {policy.displayName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2" />
              </a>
              {canManagePolicies ? (
                <div className="absolute top-2 right-2 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <PolicyRenameButton
                    fileName={policy.fileName}
                    displayName={policy.displayName}
                  />
                  <PolicyDeleteButton
                    fileName={policy.fileName}
                    displayName={policy.displayName}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
