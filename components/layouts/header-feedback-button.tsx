import { WikiChatDockTrigger } from "@/components/wiki/wiki-chat-dock"
import { WikiHeaderSearch } from "@/components/wiki/wiki-header-search"
import { cn } from "@/lib/utils"

export function HeaderFeedbackButton({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-3 self-stretch", className)}
    >
      <WikiHeaderSearch className="hidden w-[min(34vw,24rem)] self-center lg:block" />
      <WikiChatDockTrigger />
    </div>
  )
}
