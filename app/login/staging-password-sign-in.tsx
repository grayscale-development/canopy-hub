"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function StagingPasswordSignIn({
  className,
}: {
  className?: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setErrorMessage(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    if (!email || !password) {
      setErrorMessage("Enter the staging email and password.")
      setIsLoading(false)
      return
    }

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    window.location.assign("/home")
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-3">
      <p className="text-xs leading-relaxed text-white/70">
        Staging test login. This form only appears on the v2.2 preview against
        the staging database.
      </p>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-white/80">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          defaultValue="staging-manager@canopy.test"
          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-white/80">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white"
        />
      </label>
      <Button
        type="submit"
        variant="secondary"
        className={cn(className)}
        disabled={isLoading}
      >
        {isLoading ? "Signing in..." : "Sign in with staging password"}
      </Button>
      {errorMessage ? (
        <p className="text-sm leading-relaxed text-red-100">{errorMessage}</p>
      ) : null}
    </form>
  )
}
