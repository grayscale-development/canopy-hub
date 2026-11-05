import * as React from "react"

import { cn } from "@/lib/utils"

export function WikiTagPill({
  children,
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-muted px-3 py-1 text-xs font-medium text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
