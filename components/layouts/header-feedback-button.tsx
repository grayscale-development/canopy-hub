"use client"

import Link from "next/link"

import { WikiChatDockTrigger } from "@/components/wiki/wiki-chat-dock"
import { cn } from "@/lib/utils"

export function HeaderFeedbackButton({ className }: { className?: string }) {
  return (
    <div
      className={cn("-mr-4 flex items-center gap-2 self-stretch", className)}
    >
      <Link
        href="https://canopyhub.featurebase.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-full items-center px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Submit Feedback
      </Link>
      <WikiChatDockTrigger />
    </div>
  )
}
