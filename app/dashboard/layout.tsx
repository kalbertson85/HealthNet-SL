import type React from "react"
import { redirect } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { createServerClient } from "@/lib/supabase/server"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionUserAndProfile()

  const supabase = await createServerClient()
  const { data: settings } = await supabase
    .from("hospital_settings")
    .select("hospital_name, billing_logo_url")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar userRole={profile?.role ?? user.role ?? undefined} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          user={user}
          profile={profile}
          hospitalName={settings?.hospital_name ?? undefined}
          hospitalLogoUrl={settings?.billing_logo_url ?? undefined}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
