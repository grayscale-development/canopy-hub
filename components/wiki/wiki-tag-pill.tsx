import * as React from "react"
import { GlobeIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function WikiTagPill({
  children,
  className,
  scope,
  ...props
}: React.ComponentProps<"span"> & { scope?: "global" | "section" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-muted px-3 py-1 text-xs font-medium text-foreground",
        className
      )}
      {...props}
    >
      {scope === "global" ? (
        <>
          <GlobeIcon className="mr-1 size-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">Global tag: </span>
        </>
      ) : null}
      {children}
    </span>
  )
}
