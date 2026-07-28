"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LocalDevSignInButton({
  className,
}: {
  className?: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setIsLoading(true)
    setError(null)

    const response = await fetch("/api/auth/local-dev", {
      method: "POST",
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      setError(payload?.error ?? "Local dev sign-in failed.")
      setIsLoading(false)
      return
    }

    window.location.assign("/home")
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        className={cn(className)}
        onClick={handleSignIn}
        disabled={isLoading}
      >
        {isLoading ? "Signing in..." : "Continue as Dev"}
      </Button>
      {error ? <p className="text-xs text-red-100">{error}</p> : null}
    </div>
  )
}
