import { Skeleton } from "@/components/ui/skeleton"

export default function WikiLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading Wiki page content"
      className="min-w-0 flex-1 overflow-y-auto bg-white dark:bg-[#1F1F1F]"
    >
      <section className="mx-auto flex min-h-full w-full max-w-[864px] flex-col gap-8 px-6 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Skeleton className="h-10 w-64 max-w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-10/12" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-9/12" />
          <Skeleton className="mt-8 h-5 w-10/12" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-8/12" />
        </div>
      </section>
    </main>
  )
}
