"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function LocalDevSignInButton({
  className,
  email,
  password,
}: {
  className?: string
  email: string
  password: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setIsLoading(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
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
        {isLoading ? "Signing in..." : "Continue as Local Dev"}
      </Button>
      {error ? <p className="text-xs text-red-100">{error}</p> : null}
    </div>
  )
}
