import { redirect } from "next/navigation"
import { z } from "zod"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can, type PermissionKey, type SessionUserLike } from "@/lib/utils"
import { createServerClient } from "@/lib/supabase/server"

export async function requireServerActionPermission(permission: PermissionKey) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()
  if (!user) {
    redirect("/auth/login")
  }
  if (!can(user, permission)) {
    redirect("/dashboard")
  }
  return { supabase, user: user as SessionUserLike }
}

export function parseUuidOptional(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return null
  const parsed = z.string().uuid().safeParse(raw)
  if (!parsed.success) {
    throw new Error("Invalid identifier format")
  }
  return parsed.data
}
