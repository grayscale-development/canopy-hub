import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <SidebarProvider>
      {/* Hydrate the sidebar with the provider before switching to mobile. */}
      <AppSidebar activePath="/settings" />
      {children}
    </SidebarProvider>
  )
}
