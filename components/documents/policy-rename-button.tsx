"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PolicyRenameButton({
  fileName,
  displayName,
  className,
}: {
  fileName: string
  displayName: string
  className?: string
}) {
  const router = useRouter()
  const [isRenaming, setIsRenaming] = useState(false)

  async function renamePolicy() {
    const nextName = window.prompt("Rename policy", displayName)?.trim()
    if (!nextName || nextName === displayName) {
      return
    }

    setIsRenaming(true)

    try {
      const formData = new FormData()
      formData.append("old_file_name", fileName)
      formData.append("new_display_name", nextName)

      const response = await fetch("/api/policies/rename", {
        method: "POST",
        body: formData,
      })

      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        window.alert(payload?.error ?? "Rename failed.")
        return
      }

      router.refresh()
    } catch {
      window.alert("Rename failed.")
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={renamePolicy}
      disabled={isRenaming}
      className={cn(className)}
      title="Rename document"
      aria-label="Rename document"
    >
      <PencilIcon />
    </Button>
  )
}
