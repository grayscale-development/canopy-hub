"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PolicyDeleteButton({
  fileName,
  displayName,
  className,
}: {
  fileName: string
  displayName: string
  className?: string
}) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  async function deletePolicy() {
    const confirmed = window.confirm(`Delete "${displayName}"?`)
    if (!confirmed) {
      return
    }

    setIsDeleting(true)

    try {
      const formData = new FormData()
      formData.append("file_name", fileName)

      const response = await fetch("/api/policies/delete", {
        method: "POST",
        body: formData,
      })

      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        window.alert(payload?.error ?? "Delete failed.")
        return
      }

      router.refresh()
    } catch {
      window.alert("Delete failed.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={deletePolicy}
      disabled={isDeleting}
      className={cn("text-destructive hover:bg-destructive/10", className)}
      title="Delete document"
      aria-label="Delete document"
    >
      <Trash2Icon />
    </Button>
  )
}
