"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type { DepartmentDashboardFilters } from "@/lib/department-dashboard"

function FilterSelect({
  label,
  param,
  value,
  options,
}: {
  label: string
  param: string
  value: string
  options: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selected = options.some((option) => option.id === value) ? value : ""

  return (
    <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={selected}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString())
          if (event.target.value) {
            next.set(param, event.target.value)
          } else {
            next.delete(param)
          }
          next.delete("page")
          const query = next.toString()
          router.push(query ? `${pathname}?${query}` : pathname)
        }}
        className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DepartmentFilters({
  filters,
  branchId,
  eventMonth,
  eventWeek,
  eventName,
  orgId,
  orgLabel,
}: {
  filters: DepartmentDashboardFilters
  branchId: string | null
  eventMonth: string | null
  eventWeek: string | null
  eventName: string | null
  orgId: string | null
  orgLabel: string
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <FilterSelect
        label="Branch"
        param="branch"
        value={branchId ?? ""}
        options={filters.branches}
      />
      <FilterSelect
        label="Event Month"
        param="month"
        value={eventMonth ?? ""}
        options={filters.months.map((option) => ({
          id: option.id.slice(0, 7),
          label: option.label,
        }))}
      />
      <FilterSelect
        label="Event Week Of"
        param="week"
        value={eventWeek ?? ""}
        options={filters.weeks}
      />
      <FilterSelect
        label="Event"
        param="event"
        value={eventName ?? ""}
        options={filters.events}
      />
      <FilterSelect
        label={orgLabel}
        param="org"
        value={orgId ?? ""}
        options={filters.orgs}
      />
    </div>
  )
}
