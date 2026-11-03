import { Suspense } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <SidebarProvider>
      <Suspense
        fallback={
          <div
            aria-hidden="true"
            className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar md:block"
          />
        }
      >
        <AppSidebar activePath="/settings" />
      </Suspense>
      {children}
    </SidebarProvider>
  )
}
