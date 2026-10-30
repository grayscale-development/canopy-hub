import { Skeleton } from "@/components/ui/skeleton"

export default function WikiLoading() {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <aside
        aria-hidden="true"
        className="hidden w-16 shrink-0 border-r p-3 md:block lg:w-64"
      >
        <div className="space-y-3">
          <Skeleton className="mx-auto h-9 w-9 lg:mx-0 lg:w-32" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          aria-hidden="true"
          className="flex h-16 shrink-0 items-center gap-3 border-b px-4"
        >
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-4 w-40" />
        </header>
        <div className="flex min-h-0 flex-1">
          <aside
            aria-hidden="true"
            className="hidden w-72 shrink-0 border-r p-4 lg:block"
          >
            <Skeleton className="mb-5 h-5 w-32" />
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-5/6" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-4/5" />
            </div>
          </aside>
          <main
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Loading Wiki page content"
            className="min-w-0 flex-1 overflow-y-auto"
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
        </div>
      </div>
    </div>
  )
}
