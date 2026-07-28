import Image from "next/image"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { GoogleSignInButton } from "@/app/login/google-sign-in-button"
import { LocalDevSignInButton } from "@/app/login/local-dev-sign-in-button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import packageJson from "@/package.json"

export const metadata = {
  title: "Login",
}

function isLocalhostHost(host: string) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
}

export default async function LoginPage() {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? ""
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/home")
  }

  const showLocalDevLogin =
    process.env.NODE_ENV !== "production" && isLocalhostHost(host)

  return (
    <main
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-cover bg-center bg-no-repeat p-6"
      style={{ backgroundImage: "url('/background-subdivision.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <Card className="relative z-10 w-full max-w-md border-white/30 bg-white/12 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-4 px-7 pt-7 text-left sm:px-8 sm:pt-8">
          <Image
            src="/logo-light.png"
            alt="Canopy Hub logo"
            width={140}
            height={46}
            className="h-10 w-auto"
            priority
          />
          <div className="space-y-1.5">
            <CardTitle className="text-2xl leading-tight text-white sm:text-[1.75rem]">
              Login to your account
            </CardTitle>
            <CardDescription className="max-w-[35ch] text-sm leading-relaxed text-white/80">
              {showLocalDevLogin
                ? "Continue with a local development session"
                : "Sign in with your Google account to continue"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-7 pb-7 sm:px-8 sm:pb-8">
          {showLocalDevLogin ? (
            <LocalDevSignInButton className="w-full py-5" />
          ) : (
            <GoogleSignInButton className="w-full py-5" />
          )}
          <div className="border-t border-white/20 pt-4">
            <p className="text-xs text-white/70">Version {packageJson.version}</p>
          </div>
        </CardContent>
      </Card>

      <div className="absolute right-0 bottom-6 left-0 z-10 flex items-center justify-center gap-2 px-6 text-white/60">
        <Image
          src="/grayscale-logo.png"
          alt="Grayscale Development logo"
          width={18}
          height={18}
          className="h-[18px] w-[18px] rounded-sm object-contain invert opacity-50"
        />
        <p className="text-xs font-medium">Created by Grayscale Development</p>
      </div>
    </main>
  )
}
