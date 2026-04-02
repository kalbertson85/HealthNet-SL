"use server"

import { createServerClient } from "@/lib/supabase/server"
import type { SessionUserLike } from "@/lib/utils"
import { normalizeRole } from "@/lib/utils"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { cache } from "react"

export interface DashboardSessionUser extends SessionUserLike {
  email?: string | null
}

export interface DashboardSessionProfile {
  id: string
  full_name?: string | null
  role?: string | null
  facility_id?: string | null
  status?: string | null
}

const getSessionUserAndProfileCached = cache(async (): Promise<{
  user: DashboardSessionUser | null
  profile: DashboardSessionProfile | null
}> => {
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, profile: null }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", user.id)
    .maybeSingle()

  // If the staff account is blocked, sign out and treat as no active session
  const status = (profile as { status?: string | null } | null)?.status || "active"
  if (status && status !== "active") {
    await supabase.auth.signOut()
    redirect("/auth/login?blocked=1")
  }

  const normalizedRole = normalizeRole(profile?.role ?? null)

  return {
    user: {
      id: user.id,
      email: user.email,
      role: normalizedRole,
      facility_id: null,
    },
    profile: profile
      ? {
          id: profile.id,
          full_name: profile.full_name,
          role: normalizedRole,
          facility_id: null,
          status,
        }
      : null,
  }
})

export async function getSessionUserAndProfile(): Promise<{
  user: DashboardSessionUser | null
  profile: DashboardSessionProfile | null
}> {
  return getSessionUserAndProfileCached()
}

export async function signOut() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/auth/login")
}
