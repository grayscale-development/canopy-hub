import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <Image
          src="/canopy-logo-cube-100.png"
          alt="Canopy"
          width={48}
          height={48}
        />
        <h1 className="mt-5 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old or the page moved.
        </p>
        <Button asChild className="mt-5">
          <Link href="/home">Go to Home</Link>
        </Button>
      </div>
    </main>
  )
}
