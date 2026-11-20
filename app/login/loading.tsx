import { Skeleton } from "@/components/ui/skeleton"

export default function LoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="mx-auto h-12 w-12 rounded-lg" />
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </main>
  )
}
