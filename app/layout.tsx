import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WikiChatModalProvider } from "@/components/wiki/wiki-chat-modal"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: { default: "Canopy Hub", template: "Canopy Hub | %s" },
  icons: {
    icon: "/canopy-logo-cube-100.png",
    shortcut: "/canopy-logo-cube-100.png",
    apple: "/canopy-logo-cube-100.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const canUseMilo = user
    ? await userHasPermissionCode({
        supabase,
        userId: user.id,
        code: BETA_1_PERMISSION,
      }).catch(() => false)
    : false

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <WikiChatModalProvider signedIn={!!user} canUseMilo={canUseMilo}>
              {children}
            </WikiChatModalProvider>
          </TooltipProvider>
          <Toaster position="top-center" offset={24} />
        </ThemeProvider>
      </body>
    </html>
  )
}
