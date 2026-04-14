import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { uploadHospitalLogo } from "@/lib/storage"
import { createHash } from "crypto"
import { GLOBAL_SETTINGS_SELECT } from "@/lib/global-settings"
import { normalizeGlobalSettings, type GlobalSettingsInput } from "@/lib/locale-format"
import { HospitalBrandingForm } from "@/components/hospital-branding-form"
import { requireServerActionPermission } from "@/lib/server-action-security"

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

interface SystemSettingsRow {
  id?: string
  audit_logs_enabled: boolean | null
  audit_log_retention_days: number | null
}

type HospitalSettingsRow = NonNullable<GlobalSettingsInput>

interface AllowedIpRow {
  id: string
  ip_range: string
  created_at: string
}

interface SystemBackupRow {
  id: string
  created_at: string
  file_url: string | null
  status?: string | null
}

interface ApiKeyRow {
  id: string
  label: string | null
  created_at: string
}

const MAX_SETTINGS_PROFILES_ROWS = 500
const MAX_ALLOWED_IP_ROWS = 200
const MAX_API_KEY_ROWS = 200

function joinAddressParts(parts: Array<string | null>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ") || null
}

async function saveHospitalBranding(formData: FormData) {
  "use server"

  const { supabase } = await requireServerActionPermission("admin.settings.manage")
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const hospitalName = ((formData.get("hospital_name") as string | null) || "").trim()
  const addressLine1 = ((formData.get("address_line_1") as string | null) || "").trim() || null
  const addressLine2 = ((formData.get("address_line_2") as string | null) || "").trim() || null
  const city = ((formData.get("city") as string | null) || "").trim() || null
  const stateOrProvince = ((formData.get("state_or_province") as string | null) || "").trim() || null
  const postalCode = ((formData.get("postal_code") as string | null) || "").trim() || null
  const country = ((formData.get("country") as string | null) || "").trim() || null
  const address = joinAddressParts([addressLine1, addressLine2, city, stateOrProvince, postalCode, country])
  const phone = ((formData.get("phone") as string | null) || "").trim() || null
  const phoneCountryCode = ((formData.get("phone_country_code") as string | null) || "").trim() || null
  const email = ((formData.get("email") as string | null) || "").trim() || null
  const currencyCode = ((formData.get("currency_code") as string | null) || "").trim().toUpperCase() || "USD"
  const locale = ((formData.get("locale") as string | null) || "").trim() || "en-US"
  const timezone = ((formData.get("timezone") as string | null) || "").trim() || "UTC"
  const dateFormat = ((formData.get("date_format") as string | null) || "").trim() || "DD/MM/YYYY"
  const timeFormat = ((formData.get("time_format") as string | null) || "").trim() || "24h"
  const language = ((formData.get("language") as string | null) || "").trim() || "en"
  const stateLabel = ((formData.get("state_label") as string | null) || "").trim() || "State / Province"
  const cityLabel = ((formData.get("city_label") as string | null) || "").trim() || "City"
  const facilityLabel = ((formData.get("facility_label") as string | null) || "").trim() || "Facility"
  const publicCoverageLabel =
    ((formData.get("public_coverage_label") as string | null) || "").trim() || "Public coverage"

  const logoUrlFromInput = ((formData.get("billing_logo_url") as string | null) || "").trim() || null
  const logoFile = formData.get("billing_logo_file") as File | null

  let finalLogoUrl: string | null = logoUrlFromInput

  if (!hospitalName) {
    // hospital_name is NOT NULL in the database; avoid failing insert/update silently
    redirect("/dashboard/settings/hospital?tab=branding&error=missing_name")
  }

  if (logoFile && logoFile.size > 0) {
    try {
      finalLogoUrl = await uploadHospitalLogo(logoFile)
    } catch (e) {
      console.error("[v0] Error uploading hospital logo", e)
    }
  }

  const { data: existing } = await supabase
    .from("hospital_settings")
    .select(
      "id, hospital_name, billing_logo_url, address, address_line_1, address_line_2, city, state_or_province, postal_code, country, phone, phone_country_code, email, currency_code, locale, timezone, date_format, time_format, language, state_label, city_label, facility_label, public_coverage_label",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const payload = {
    hospital_name: hospitalName,
    billing_logo_url: finalLogoUrl,
    address,
    address_line_1: addressLine1,
    address_line_2: addressLine2,
    city,
    state_or_province: stateOrProvince,
    postal_code: postalCode,
    country,
    phone,
    phone_country_code: phoneCountryCode,
    email,
    currency_code: currencyCode,
    locale,
    timezone,
    date_format: dateFormat,
    time_format: timeFormat,
    language,
    state_label: stateLabel,
    city_label: cityLabel,
    facility_label: facilityLabel,
    public_coverage_label: publicCoverageLabel,
  }

  let insertedHospitalSettingsId: string | null = null
  if (existing?.id) {
    const { error: updateError } = await supabase.from("hospital_settings").update(payload).eq("id", existing.id)
    if (updateError) {
      redirect("/dashboard/settings/hospital?tab=branding&error=branding_update_failed")
    }
  } else {
    const { data: insertedRow, error: insertError } = await supabase
      .from("hospital_settings")
      .insert(payload)
      .select("id")
      .single()
    if (insertError || !insertedRow?.id) {
      redirect("/dashboard/settings/hospital?tab=branding&error=branding_create_failed")
    }
    insertedHospitalSettingsId = insertedRow.id
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "hospital_branding_update",
  })
  if (auditError) {
    if (existing?.id) {
      await supabase
        .from("hospital_settings")
        .update({
          hospital_name: existing.hospital_name,
          billing_logo_url: existing.billing_logo_url,
          address: existing.address,
          address_line_1: existing.address_line_1,
          address_line_2: existing.address_line_2,
          city: existing.city,
          state_or_province: existing.state_or_province,
          postal_code: existing.postal_code,
          country: existing.country,
          phone: existing.phone,
          phone_country_code: existing.phone_country_code,
          email: existing.email,
          currency_code: existing.currency_code,
          locale: existing.locale,
          timezone: existing.timezone,
          date_format: existing.date_format,
          time_format: existing.time_format,
          language: existing.language,
          state_label: existing.state_label,
          city_label: existing.city_label,
          facility_label: existing.facility_label,
          public_coverage_label: existing.public_coverage_label,
        })
        .eq("id", existing.id)
    } else if (insertedHospitalSettingsId) {
      await supabase.from("hospital_settings").delete().eq("id", insertedHospitalSettingsId)
    }
    redirect("/dashboard/settings/hospital?tab=branding&error=audit_log_failed")
  }

  redirect("/dashboard/settings/hospital?tab=branding&status=branding_saved")
}

async function assignUserRole(formData: FormData) {
  "use server"

  const { supabase } = await requireServerActionPermission("admin.settings.manage")
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const userId = ((formData.get("user_id") as string | null) || "").trim()
  const role = ((formData.get("role") as string | null) || "").trim()
  const password = ((formData.get("password") as string | null) || "").trim()

  if (!userId || !role || !password) {
    redirect("/dashboard/settings/hospital?tab=permissions")
  }

  if (!user.email) {
    redirect("/dashboard/settings/hospital?tab=permissions")
  }

  const { error: confirmError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (confirmError) {
    redirect("/dashboard/settings/hospital?tab=permissions&error=confirm_failed")
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle()
  if (existingProfileError || !existingProfile?.id) {
    redirect("/dashboard/settings/hospital?tab=permissions&error=user_not_found")
  }

  const { error: updateError } = await supabase.from("profiles").update({ role }).eq("id", userId)
  if (updateError) {
    redirect("/dashboard/settings/hospital?tab=permissions&error=role_update_failed")
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: userId,
    action: "role_change",
    old_role: existingProfile.role || null,
    new_role: role,
  })
  if (auditError) {
    await supabase.from("profiles").update({ role: existingProfile.role || null }).eq("id", userId)
    redirect("/dashboard/settings/hospital?tab=permissions&error=audit_log_failed")
  }

  redirect("/dashboard/settings/hospital?tab=permissions&status=role_saved")
}

async function saveSecuritySettings(formData: FormData) {
  "use server"

  const { supabase } = await requireServerActionPermission("admin.settings.manage")
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const auditLogsEnabled = formData.get("audit_logs_enabled") === "on"
  const password = ((formData.get("password") as string | null) || "").trim()

  if (!password || !user.email) {
    redirect("/dashboard/settings/hospital?tab=security")
  }

  const { error: confirmError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (confirmError) {
    redirect("/dashboard/settings/hospital?tab=security&error=confirm_failed")
  }

  let retentionDays = Number(formData.get("audit_log_retention_days"))
  if (!Number.isFinite(retentionDays) || Number.isNaN(retentionDays)) {
    retentionDays = 30
  }

  const { data: existing } = await supabase
    .from("system_settings")
    .select("id, audit_logs_enabled, audit_log_retention_days")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const payload = {
    audit_logs_enabled: auditLogsEnabled,
    audit_log_retention_days: retentionDays,
  }

  let insertedSystemSettingsId: string | null = null
  if (existing?.id) {
    const { error: updateError } = await supabase.from("system_settings").update(payload).eq("id", existing.id)
    if (updateError) {
      redirect("/dashboard/settings/hospital?tab=security&error=security_update_failed")
    }
  } else {
    const { data: insertedSettingsRow, error: insertError } = await supabase
      .from("system_settings")
      .insert(payload)
      .select("id")
      .single()
    if (insertError || !insertedSettingsRow?.id) {
      redirect("/dashboard/settings/hospital?tab=security&error=security_create_failed")
    }
    insertedSystemSettingsId = insertedSettingsRow.id
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "system_security_update",
  })
  if (auditError) {
    if (existing?.id) {
      await supabase
        .from("system_settings")
        .update({
          audit_logs_enabled: existing.audit_logs_enabled ?? true,
          audit_log_retention_days: existing.audit_log_retention_days ?? 30,
        })
        .eq("id", existing.id)
    } else if (insertedSystemSettingsId) {
      await supabase.from("system_settings").delete().eq("id", insertedSystemSettingsId)
    }
    redirect("/dashboard/settings/hospital?tab=security&error=audit_log_failed")
  }

  redirect("/dashboard/settings/hospital")
}

async function addAllowedIp(formData: FormData) {
  "use server"

  const { supabase } = await requireServerActionPermission("admin.settings.manage")
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const ipRange = ((formData.get("ip_range") as string | null) || "").trim()
  const confirmed = formData.get("confirm_ip_change") === "on"
  const password = ((formData.get("password") as string | null) || "").trim()

  if (!ipRange || !confirmed || !password || !user.email) {
    redirect("/dashboard/settings/hospital?tab=security")
  }

  const { error: confirmError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (confirmError) {
    redirect("/dashboard/settings/hospital?error=confirm_failed")
  }

  const { data: insertedIpRow, error: insertIpError } = await supabase
    .from("security_allowed_ips")
    .insert({
      ip_range: ipRange,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (insertIpError || !insertedIpRow?.id) {
    redirect("/dashboard/settings/hospital?tab=security&error=ip_add_failed")
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "security_allowed_ip_add",
  })
  if (auditError) {
    await supabase.from("security_allowed_ips").delete().eq("id", insertedIpRow.id as string)
    redirect("/dashboard/settings/hospital?tab=security&error=audit_log_failed")
  }

  redirect("/dashboard/settings/hospital?tab=security&status=ip_added")
}

async function triggerBackup(formData: FormData) {
  "use server"

  const { supabase } = await requireServerActionPermission("admin.settings.manage")
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const password = ((formData.get("password") as string | null) || "").trim()

  if (!password || !user.email) {
    redirect("/dashboard/settings/hospital?tab=backup")
  }

  const { error: confirmError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (confirmError) {
    redirect("/dashboard/settings/hospital?error=confirm_failed")
  }

  const { data: insertedBackupRow, error: insertBackupError } = await supabase
    .from("system_backups")
    .insert({
      file_url: null,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (insertBackupError || !insertedBackupRow?.id) {
    redirect("/dashboard/settings/hospital?tab=backup&error=backup_trigger_failed")
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "system_backup_trigger",
  })
  if (auditError) {
    await supabase.from("system_backups").delete().eq("id", insertedBackupRow.id as string)
    redirect("/dashboard/settings/hospital?tab=backup&error=audit_log_failed")
  }

  redirect("/dashboard/settings/hospital?tab=backup&status=backup_triggered")
}

async function createApiKey(formData: FormData) {
  "use server"

  const { supabase } = await requireServerActionPermission("admin.settings.manage")
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const label = ((formData.get("label") as string | null) || "").trim() || null
  const secret = ((formData.get("secret") as string | null) || "").trim()

  const password = ((formData.get("password") as string | null) || "").trim()

  if (!secret || !password || !user.email) {
    redirect("/dashboard/settings/hospital?tab=integrations")
  }

  const { error: confirmError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (confirmError) {
    redirect("/dashboard/settings/hospital?error=confirm_failed")
  }

  const keyHash = createHash("sha256").update(secret).digest("hex")

  const { data: insertedApiKeyRow, error: insertApiKeyError } = await supabase
    .from("api_keys")
    .insert({
      label,
      key_hash: keyHash,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (insertApiKeyError || !insertedApiKeyRow?.id) {
    redirect("/dashboard/settings/hospital?tab=integrations&error=api_key_create_failed")
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "api_key_create",
  })
  if (auditError) {
    await supabase.from("api_keys").delete().eq("id", insertedApiKeyRow.id as string)
    redirect("/dashboard/settings/hospital?tab=integrations&error=audit_log_failed")
  }

  redirect("/dashboard/settings/hospital?tab=integrations&status=api_key_created")
}

export default async function HospitalSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; status?: string; error?: string }>
}) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const sp = searchParams ? await searchParams : undefined
  const activeTab = sp?.tab ?? "branding"

  const { data: settings } = await supabase
    .from("hospital_settings")
    .select(GLOBAL_SETTINGS_SELECT)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<HospitalSettingsRow>()

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .order("full_name", { ascending: true })
    .limit(MAX_SETTINGS_PROFILES_ROWS)

  const { data: systemSettings } = await supabase
    .from("system_settings")
    .select("id, audit_logs_enabled, audit_log_retention_days")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<SystemSettingsRow>()

  const { data: allowedIps } = await supabase
    .from("security_allowed_ips")
    .select("id, ip_range, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ALLOWED_IP_ROWS)

  const { data: backups } = await supabase
    .from("system_backups")
    .select("id, created_at, file_url, status")
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, label, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_API_KEY_ROWS)

  const profilesTruncated = (profiles || []).length >= MAX_SETTINGS_PROFILES_ROWS
  const allowedIpsTruncated = (allowedIps || []).length >= MAX_ALLOWED_IP_ROWS
  const apiKeysTruncated = (apiKeys || []).length >= MAX_API_KEY_ROWS

  return (
    <div className="space-y-6">
      {sp?.status === "branding_saved" && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Branding saved. New hospital details will appear on invoices and reports.
        </div>
      )}
      {sp?.error === "missing_name" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Hospital name is required. Please enter a name before saving branding.
        </div>
      )}
      {sp?.error === "confirm_failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Password confirmation failed. Please double-check your password and try again.
        </div>
      )}
      {sp?.status === "role_saved" && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Role updated successfully.
        </div>
      )}
      {sp?.status === "security_saved" && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Security settings saved.
        </div>
      )}
      {sp?.status === "ip_added" && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Allowed IP range added.
        </div>
      )}
      {sp?.status === "backup_triggered" && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Backup has been triggered.
        </div>
      )}
      {sp?.status === "api_key_created" && (
        <div className="rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          API key created. Remember to store the secret value securely.
        </div>
      )}
      {profilesTruncated && (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900">
          Staff role assignments are capped at {MAX_SETTINGS_PROFILES_ROWS} users for performance.
        </div>
      )}
      {allowedIpsTruncated && (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900">
          Allowed IPs are capped at {MAX_ALLOWED_IP_ROWS} entries in this view.
        </div>
      )}
      {apiKeysTruncated && (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-900">
          API keys are capped at {MAX_API_KEY_ROWS} entries in this view.
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Settings
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Facility Settings</h1>
            <p className="text-muted-foreground">
              Configure branding, regional settings, permissions, security, backups, and integrations for your facility.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={activeTab} className="space-y-6">
        <TabsList className="flex flex-wrap justify-start gap-2">
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
              <CardDescription>Details used on invoices, reports, patient-facing documents, and regional formatting.</CardDescription>
            </CardHeader>
            <CardContent>
              <HospitalBrandingForm
                action={saveHospitalBranding}
                initialSettings={normalizeGlobalSettings(settings)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle>Role &amp; permission management</CardTitle>
              <CardDescription>
                Assign application roles to staff. Roles are stored in the user_roles table and used by RBAC helpers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Role permission matrix</p>
                <p className="text-xs text-muted-foreground">
                  This matrix summarizes which standard roles have access to key areas of the system. It mirrors the
                  built-in RBAC helpers and can be adjusted in a future update.
                </p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[11px] text-muted-foreground">
                        <th className="py-2 px-2 font-medium">Permission</th>
                        <th className="py-2 px-2 font-medium">Admin</th>
                        <th className="py-2 px-2 font-medium">Facility admin</th>
                        <th className="py-2 px-2 font-medium">Doctor</th>
                        <th className="py-2 px-2 font-medium">Nurse</th>
                        <th className="py-2 px-2 font-medium">Pharmacist</th>
                        <th className="py-2 px-2 font-medium">Lab tech</th>
                        <th className="py-2 px-2 font-medium">Cashier</th>
                        <th className="py-2 px-2 font-medium">Clerk</th>
                        <th className="py-2 px-2 font-medium">Receptionist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          key: "dashboard.view",
                          label: "Dashboard view",
                          roles: ["admin", "facility_admin", "doctor", "nurse", "pharmacist", "lab_tech", "cashier", "clerk", "receptionist"],
                        },
                        {
                          key: "patients.view",
                          label: "Patients - view",
                          roles: ["admin", "facility_admin", "doctor", "nurse", "pharmacist", "lab_tech", "cashier", "clerk", "receptionist"],
                        },
                        {
                          key: "patients.edit",
                          label: "Patients - edit",
                          roles: ["admin", "facility_admin", "doctor", "nurse", "clerk"],
                        },
                        {
                          key: "patients.create",
                          label: "Patients - create",
                          roles: ["admin", "facility_admin", "doctor", "nurse", "receptionist", "clerk"],
                        },
                        {
                          key: "appointments.manage",
                          label: "Appointments",
                          roles: ["admin", "facility_admin", "doctor", "nurse", "receptionist"],
                        },
                        {
                          key: "emergency.manage",
                          label: "Emergency",
                          roles: ["admin", "facility_admin", "doctor", "nurse"],
                        },
                        {
                          key: "queue.manage",
                          label: "Queue",
                          roles: ["admin", "facility_admin", "doctor", "nurse", "receptionist"],
                        },
                        {
                          key: "prescriptions.manage",
                          label: "Prescriptions",
                          roles: ["admin", "facility_admin", "doctor", "pharmacist"],
                        },
                        {
                          key: "lab.manage",
                          label: "Lab",
                          roles: ["admin", "facility_admin", "lab_tech", "doctor"],
                        },
                        {
                          key: "pharmacy.manage",
                          label: "Pharmacy",
                          roles: ["admin", "facility_admin", "pharmacist"],
                        },
                        {
                          key: "inpatient.manage",
                          label: "Inpatient",
                          roles: ["admin", "facility_admin", "doctor", "nurse"],
                        },
                        {
                          key: "billing.manage",
                          label: "Billing",
                          roles: ["admin", "facility_admin", "cashier"],
                        },
                        {
                          key: "notifications.manage",
                          label: "Notifications",
                          roles: ["admin", "facility_admin"],
                        },
                        {
                          key: "reports.view",
                          label: "Reports",
                          roles: ["admin", "facility_admin", "doctor", "nurse", "lab_tech", "cashier"],
                        },
                        {
                          key: "admin.export",
                          label: "Data export",
                          roles: ["admin", "facility_admin"],
                        },
                        {
                          key: "admin.settings.manage",
                          label: "Admin settings",
                          roles: ["admin", "facility_admin"],
                        },
                      ].map((row) => (
                        <tr key={row.key} className="border-b last:border-0">
                          <td className="py-1 px-2 text-xs font-medium text-foreground">{row.label}</td>
                          {[
                            "admin",
                            "facility_admin",
                            "doctor",
                            "nurse",
                            "pharmacist",
                            "lab_tech",
                            "cashier",
                            "clerk",
                            "receptionist",
                          ].map((role) => (
                            <td key={role} className="py-1 px-2 text-center align-middle text-[11px]">
                              {row.roles.includes(role) ? "✓" : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Current role assignments</p>
                <p className="text-xs text-muted-foreground">
                  These roles control access across the application. Changes take effect immediately.
                </p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="py-2 px-2 font-medium">Name</th>
                        <th className="py-2 px-2 font-medium">Email</th>
                        <th className="py-2 px-2 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(profiles || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-4 px-2 text-center text-xs text-muted-foreground">
                            No staff profiles found.
                          </td>
                        </tr>
                      )}
                      {(profiles || []).map((profile: ProfileRow) => (
                        <tr key={profile.id} className="border-b last:border-0">
                          <td className="py-2 px-2 text-sm">{profile.full_name || "(No name)"}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{profile.email || ""}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{profile.role || "(none)"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Assign or update role</p>
                <form action={assignUserRole} className="grid gap-3 md:grid-cols-4 items-end">
                  <div className="space-y-1">
                    <label htmlFor="user_id" className="text-sm font-medium">
                      User
                    </label>
                    <select
                      id="user_id"
                      name="user_id"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select user
                      </option>
                      {(profiles || []).map((profile: ProfileRow) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.full_name || profile.email || profile.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 md:col-span-1">
                    <label htmlFor="role" className="text-sm font-medium">
                      Role
                    </label>
                    <select
                      id="role"
                      name="role"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select role
                      </option>
                      <option value="admin">Admin</option>
                      <option value="facility_admin">Facility admin</option>
                      <option value="doctor">Doctor</option>
                      <option value="nurse">Nurse</option>
                      <option value="pharmacist">Pharmacist</option>
                      <option value="lab_tech">Lab tech</option>
                      <option value="cashier">Cashier</option>
                      <option value="clerk">Clerk / Records</option>
                      <option value="receptionist">Receptionist</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      Choose a standard application role. Custom roles can be added via the database if needed.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="role_password" className="text-sm font-medium">
                      Confirm with password
                    </label>
                    <Input
                      id="role_password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Re-enter your password to confirm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Required to confirm sensitive changes to staff roles.
                    </p>
                  </div>

                  <div className="flex justify-end md:justify-start">
                    <Button type="submit" className="mt-5 md:mt-0">
                      Save role
                    </Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security configuration</CardTitle>
              <CardDescription>
                Configure audit logging and allowed IP ranges. Changes apply to all users of the system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid gap-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground md:grid-cols-3">
                <div>
                  <p className="font-medium text-foreground">Audit logging</p>
                  <p>{systemSettings?.audit_logs_enabled === false ? "Disabled" : "Enabled"}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Retention</p>
                  <p>{systemSettings?.audit_log_retention_days ?? 30} days</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Allowed IP ranges</p>
                  <p>{allowedIps?.length ?? 0} configured</p>
                </div>
              </div>

              <form action={saveSecuritySettings} className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Audit logging</p>
                  <p className="text-xs text-muted-foreground">
                    Enable or disable audit logs for key actions, and choose how long to retain them.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="audit_logs_enabled"
                    name="audit_logs_enabled"
                    type="checkbox"
                    defaultChecked={systemSettings?.audit_logs_enabled ?? true}
                    className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <label htmlFor="audit_logs_enabled" className="text-sm">
                    Enable audit logging
                  </label>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  When disabled, new actions will not be written to the audit log. Historical logs remain in place until
                  they expire based on the retention setting below.
                </p>

                <div className="space-y-1">
                  <label htmlFor="audit_log_retention_days" className="text-sm font-medium">
                    Audit log retention
                  </label>
                  <select
                    id="audit_log_retention_days"
                    name="audit_log_retention_days"
                    defaultValue={String(systemSettings?.audit_log_retention_days ?? 30)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="180">180 days</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Older audit entries may be pruned automatically after this number of days, depending on your
                    database retention policy.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-end">
                  <div className="space-y-1">
                    <label htmlFor="security_password" className="text-sm font-medium">
                      Confirm with password
                    </label>
                    <Input
                      id="security_password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Re-enter your password to confirm security changes"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Required before changing audit logging or retention settings.
                    </p>
                  </div>
                  <div className="flex justify-end md:justify-start">
                    <Button type="submit">Save security settings</Button>
                  </div>
                </div>
              </form>

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Allowed IP ranges</p>
                  <p className="text-xs text-muted-foreground">
                    Optionally restrict access to specific IP addresses or CIDR ranges. When at least one range is
                    configured, all other IPs may be blocked by your network configuration.
                  </p>
                </div>

                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="py-2 px-2 font-medium">IP / CIDR</th>
                        <th className="py-2 px-2 font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!allowedIps || allowedIps.length === 0) && (
                        <tr>
                          <td colSpan={2} className="py-4 px-2 text-center text-xs text-muted-foreground">
                            No IP restrictions configured.
                          </td>
                        </tr>
                      )}
                      {(allowedIps || []).map((row: AllowedIpRow) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 px-2 text-sm">{row.ip_range}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <form action={addAllowedIp} className="mt-3 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-end">
                  <div className="space-y-1">
                    <label htmlFor="ip_range" className="text-sm font-medium">
                      Add allowed IP / CIDR
                    </label>
                    <Input
                      id="ip_range"
                      name="ip_range"
                      placeholder="e.g. 102.89.0.1 or 102.89.0.0/24"
                    />
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        id="confirm_ip_change"
                        name="confirm_ip_change"
                        type="checkbox"
                        className="h-3 w-3 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <label htmlFor="confirm_ip_change" className="text-[11px] text-muted-foreground">
                        I understand that misconfigured IP ranges may block access for some users.
                      </label>
                    </div>
                    <div className="mt-2 space-y-1">
                      <label htmlFor="ip_password" className="text-sm font-medium">
                        Confirm with password
                      </label>
                      <Input
                        id="ip_password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="Re-enter your password to confirm IP changes"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end md:justify-start">
                    <Button type="submit">Add IP range</Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle>Backup &amp; restore</CardTitle>
              <CardDescription>
                Trigger and review secure database backups stored in the system_backups table.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={triggerBackup} className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Manual backup</p>
                  <p className="text-xs text-muted-foreground">
                    Trigger a new backup of the primary database. This may take a few minutes to complete.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-end">
                  <div className="space-y-1">
                    <label htmlFor="backup_password" className="text-sm font-medium">
                      Confirm with password
                    </label>
                    <Input
                      id="backup_password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Re-enter your password before triggering a backup"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Required to prevent accidental or unauthorized backups.
                    </p>
                  </div>
                  <div className="flex justify-end md:justify-start">
                    <Button type="submit">Trigger backup</Button>
                  </div>
                </div>
              </form>

              <div className="space-y-2">
                <p className="text-sm font-medium">Recent backups</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="py-2 px-2 font-medium">Created at</th>
                        <th className="py-2 px-2 font-medium">Status</th>
                        <th className="py-2 px-2 font-medium">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!backups || backups.length === 0) && (
                        <tr>
                          <td colSpan={3} className="py-4 px-2 text-center text-xs text-muted-foreground">
                            No backups have been recorded yet. Use &quot;Trigger backup&quot; above to create the first one.
                          </td>
                        </tr>
                      )}
                      {(backups || []).map((backup: SystemBackupRow) => (
                        <tr key={backup.id} className="border-b last:border-0">
                          <td className="py-2 px-2 text-sm">
                            {new Date(backup.created_at).toLocaleString()}
                          </td>
                          <td
                            className="py-2 px-2 text-xs text-muted-foreground"
                            title={backup.status ? `Backup status reported by the system: ${backup.status}` : "Backup has been requested; status not yet updated."}
                          >
                            {backup.status || "pending"}
                          </td>
                          <td
                            className="py-2 px-2 text-xs text-muted-foreground"
                            title={backup.file_url ? backup.file_url : "The backup file location has not yet been set."}
                          >
                            {backup.file_url ? (
                              <a
                                href={backup.file_url}
                                className="text-xs text-primary underline underline-offset-2"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download
                              </a>
                            ) : (
                              <span>Not yet available</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use these keys as bearer tokens or custom headers when integrating external billing, reporting, or HR
                  systems. Store secrets in environment variables rather than hard-coding them in client applications.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Integrations &amp; API keys</CardTitle>
              <CardDescription>
                Manage API keys used by external systems (billing, reporting, etc.). Keys are stored as hashes only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={createApiKey} className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Create API key</p>
                  <p className="text-xs text-muted-foreground">
                    Enter a label and a secret key value to be hashed and stored. Make sure you keep the secret value in
                    a secure password manager – it will not be shown again.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3 items-end">
                  <div className="space-y-1">
                    <label htmlFor="label" className="text-sm font-medium">
                      Label
                    </label>
                    <Input id="label" name="label" placeholder="e.g. Billing integration" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="secret" className="text-sm font-medium">
                      Secret
                    </label>
                    <Input
                      id="secret"
                      name="secret"
                      type="text"
                      placeholder="Paste or generate a strong secret key"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="api_password" className="text-sm font-medium">
                      Confirm with password
                    </label>
                    <Input
                      id="api_password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Re-enter your password to confirm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Required before creating a new API key.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Create API key</Button>
                </div>
              </form>

              <div className="space-y-2">
                <p className="text-sm font-medium">Existing API keys</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="py-2 px-2 font-medium">Label</th>
                        <th className="py-2 px-2 font-medium">Created at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!apiKeys || apiKeys.length === 0) && (
                        <tr>
                          <td colSpan={2} className="py-4 px-2 text-center text-xs text-muted-foreground">
                            No API keys have been created yet.
                          </td>
                        </tr>
                      )}
                      {(apiKeys || []).map((key: ApiKeyRow) => (
                        <tr key={key.id} className="border-b last:border-0">
                          <td className="py-2 px-2 text-sm">{key.label || "(no label)"}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">
                            {new Date(key.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
