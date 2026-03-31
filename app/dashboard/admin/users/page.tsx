import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getSupabaseAdminClient } from "@/lib/storage"

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  status: string | null
}

async function assignUserRole(formData: FormData) {
  "use server"

  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const userId = ((formData.get("user_id") as string | null) || "").trim()
  const role = ((formData.get("role") as string | null) || "").trim()
  const currentRole = ((formData.get("current_role") as string | null) || "").trim()

  if (!userId || !role) {
    redirect("/dashboard/admin/users")
  }

  await supabase.from("profiles").update({ role }).eq("id", userId)

  if (currentRole !== role) {
    await supabase.from("admin_audit_logs").insert({
      actor_user_id: user.id,
      target_user_id: userId,
      action: "role_change",
      old_role: currentRole || null,
      new_role: role,
    })
  }

  redirect("/dashboard/admin/users?status=role_saved")
}

async function updateUserStatus(formData: FormData) {
  "use server"

  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const userId = ((formData.get("user_id") as string | null) || "").trim()
  const status = ((formData.get("status") as string | null) || "").trim()
  const currentStatus = ((formData.get("current_status") as string | null) || "").trim()

  if (!userId || !status) {
    redirect("/dashboard/admin/users")
  }

  await supabase.from("profiles").update({ status }).eq("id", userId)

  if (currentStatus !== status) {
    await supabase.from("admin_audit_logs").insert({
      actor_user_id: user.id,
      target_user_id: userId,
      action: "status_change",
      old_status: currentStatus || null,
      new_status: status,
    })
  }

  redirect("/dashboard/admin/users?status=status_saved")
}

async function createUser(formData: FormData) {
  "use server"

  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const fullName = ((formData.get("full_name") as string | null) || "").trim()
  const email = ((formData.get("email") as string | null) || "").trim()
  const phoneNumber = ((formData.get("phone_number") as string | null) || "").trim()
  const role = ((formData.get("role") as string | null) || "").trim()

  if (!fullName || !email || !role) {
    redirect("/dashboard/admin/users?error=invalid_input")
  }

  const adminClient = getSupabaseAdminClient()

  // Generate a temporary password; staff should reset it on first login via the forgot-password flow.
  const tempPassword = Math.random().toString(36).slice(-10) + "Aa1!"

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: false,
    user_metadata: {
      full_name: fullName,
      role,
      phone_number: phoneNumber || null,
    },
  })

  if (error || !data.user) {
    console.error("[v0] Error creating staff user via admin API:", error?.message || error)
    redirect("/dashboard/admin/users?error=create_failed")
  }

  try {
    // Ensure there is a matching profile row with role set for RBAC helpers.
    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: data.user.id,
        full_name: fullName,
        email,
        role,
      },
      { onConflict: "id" },
    )

    if (profileError) {
      console.error("[v0] Error upserting profile for new staff user:", profileError.message || profileError)
    }
  } catch (profileUpsertError) {
    console.error("[v0] Unexpected error while upserting profile for new staff user:", profileUpsertError)
  }

  redirect("/dashboard/admin/users?status=user_created")
}

export default async function AdminUsersPage() {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status")
    .order("full_name", { ascending: true })

  const rows = (profiles || []) as ProfileRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          View staff accounts and assign application roles such as doctor, nurse, and cashier.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold">Status legend:</span> <span className="font-medium">Active</span> users can
          sign in and access the system according to their role. <span className="font-medium">Blocked</span> users
          are signed out and cannot access the dashboard until reactivated.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create staff user</CardTitle>
          <CardDescription>
            Create a new staff account and assign a role. The user will receive credentials and should change their
            password after first login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createUser} className="grid gap-3 md:grid-cols-4 items-end text-sm">
            <div className="space-y-1 md:col-span-1">
              <label htmlFor="full_name" className="text-xs font-medium text-muted-foreground">
                Full name
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label htmlFor="phone_number" className="text-xs font-medium text-muted-foreground">
                Phone (optional)
              </label>
              <input
                id="phone_number"
                name="phone_number"
                type="tel"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <label htmlFor="role" className="text-xs font-medium text-muted-foreground">
                Role
              </label>
              <select
                id="role"
                name="role"
                required
                title="Select staff role"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                <option value="clerk">Clerk</option>
                <option value="receptionist">Receptionist</option>
              </select>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" size="sm">
                Create user
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff list</CardTitle>
          <CardDescription>All users with profiles in the system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No staff profiles found.</p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="py-2 px-2 font-medium">Name</th>
                    <th className="py-2 px-2 font-medium">Email</th>
                    <th className="py-2 px-2 font-medium">Current role</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium">Role &amp; status controls</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((profile) => (
                    <tr key={profile.id} className="border-b last:border-0 align-top">
                      <td className="py-2 px-2 text-sm whitespace-nowrap">{profile.full_name || "(No name)"}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{profile.email || ""}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground capitalize whitespace-nowrap">
                        {profile.role || "(none)"}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground capitalize whitespace-nowrap">
                        {profile.status || "active"}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        <div className="space-y-1">
                          <form action={assignUserRole} className="flex items-center gap-2">
                          <input type="hidden" name="user_id" value={profile.id} />
                          <input type="hidden" name="current_role" value={profile.role || ""} />
                          <select
                            name="role"
                            defaultValue={profile.role || ""}
                            title="Assign role"
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Select role</option>
                            <option value="admin">Admin</option>
                            <option value="facility_admin">Facility admin</option>
                            <option value="doctor">Doctor</option>
                            <option value="nurse">Nurse</option>
                            <option value="pharmacist">Pharmacist</option>
                            <option value="lab_tech">Lab tech</option>
                            <option value="cashier">Cashier</option>
                            <option value="clerk">Clerk</option>
                            <option value="receptionist">Receptionist</option>
                          </select>
                          <Button type="submit" size="sm" variant="outline">
                            Save
                          </Button>
                        </form>
                          <form action={updateUserStatus} className="flex items-center gap-2">
                          <input type="hidden" name="user_id" value={profile.id} />
                          <input type="hidden" name="current_status" value={profile.status || ""} />
                          <select
                            name="status"
                            defaultValue={profile.status || "active"}
                            title="Set account status"
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="active">Active</option>
                            <option value="blocked">Blocked</option>
                          </select>
                          <Button type="submit" size="sm" variant="ghost">
                            Update
                          </Button>
                        </form>
                          <Button
                            asChild
                            size="sm"
                            variant="link"
                            className="h-6 px-0 text-[11px] text-muted-foreground"
                          >
                            <a href={`/dashboard/admin/audit-logs?target=${encodeURIComponent(profile.id)}`}>
                              View in audit logs
                            </a>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
