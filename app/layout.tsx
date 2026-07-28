import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"
import { Toaster } from "sonner"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WikiChatDockProvider } from "@/components/wiki/wiki-chat-dock"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "Canopy Hub",
    template: "Canopy Hub | %s",
  },
  icons: {
    icon: "/canopy-logo-cube-100.png",
    shortcut: "/canopy-logo-cube-100.png",
    apple: "/canopy-logo-cube-100.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
          <WikiChatDockProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </WikiChatDockProvider>
          <Toaster position="top-center" offset={24} richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
