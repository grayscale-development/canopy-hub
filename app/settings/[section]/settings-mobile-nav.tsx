"use client"

import { useRouter } from "next/navigation"

type Item = { key: string; label: string }

export function SettingsMobileNav({
  items,
  active,
}: {
  items: Item[]
  active: string
}) {
  const router = useRouter()
  if (!items.length) return null
  return (
    <div className="md:hidden">
      <label htmlFor="settings-section" className="sr-only">
        Settings section
      </label>
      <select
        id="settings-section"
        value={items.some((item) => item.key === active) ? active : ""}
        onChange={(event) => router.push(`/settings/${event.target.value}`)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {!items.some((item) => item.key === active) && (
          <option value="" disabled>
            Select a settings section
          </option>
        )}
        {items.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  )
}
