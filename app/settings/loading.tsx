import { SidebarInset } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <SidebarInset>
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading settings"
        className="flex flex-1 flex-col"
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-40" />
        </header>
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </SidebarInset>
  )
}
