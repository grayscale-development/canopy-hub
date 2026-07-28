"use client"

import Image from "next/image"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function GoogleSignInButton({ className }: { className?: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSignIn = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const supabase = createSupabaseBrowserClient()
    const redirectTo = new URL("/auth/callback", window.location.origin).toString()

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          scopes: "openid email profile",
        },
      })

      if (error) {
        setErrorMessage(
          error.message.includes("Unsupported provider")
            ? "Google sign-in is not enabled for this Supabase project yet."
            : error.message
        )
        setIsLoading(false)
      }
    } catch {
      setErrorMessage("Google sign-in could not start. Try again in a moment.")
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        className={cn(className)}
        onClick={handleSignIn}
        disabled={isLoading}
      >
        {isLoading ? (
          "Redirecting..."
        ) : (
          <>
            <Image
              src="/google-logo.png"
              alt=""
              width={18}
              height={18}
              className="h-[18px] w-[18px]"
              aria-hidden
            />
            <span>Continue with Google</span>
          </>
        )}
      </Button>
      {errorMessage ? (
        <p className="text-sm leading-relaxed text-red-100">{errorMessage}</p>
      ) : null}
    </div>
  )
}
