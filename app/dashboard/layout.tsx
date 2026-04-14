import type React from "react"
import { redirect } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { SessionIdleGuard } from "@/components/session-idle-guard"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { getGlobalSettings } from "@/lib/global-settings"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionUserAndProfile()
  const settings = await getGlobalSettings()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DashboardSidebar userRole={profile?.role ?? user.role ?? undefined} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardHeader
          user={user}
          profile={profile}
          hospitalName={settings.hospitalName}
          hospitalLogoUrl={settings.billingLogoUrl ?? undefined}
        />
        <SessionIdleGuard />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
