import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"

async function changePassword(formData: FormData) {
  "use server"

  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    redirect("/auth/login")
  }

  const currentPassword = ((formData.get("current_password") as string | null) || "").trim()
  const newPassword = ((formData.get("new_password") as string | null) || "").trim()
  const confirmPassword = ((formData.get("confirm_password") as string | null) || "").trim()

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirect("/dashboard/settings?error=password_incomplete")
  }

  if (newPassword.length < 8) {
    redirect("/dashboard/settings?error=password_too_short")
  }

  if (newPassword !== confirmPassword) {
    redirect("/dashboard/settings?error=password_mismatch")
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (verifyError) {
    redirect("/dashboard/settings?error=invalid_current_password")
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    redirect("/dashboard/settings?error=password_update_failed")
  }

  redirect("/dashboard/settings?status=password_changed")
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string
    error?: string
  }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const status = resolvedSearchParams?.status
  const error = resolvedSearchParams?.error

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and system preferences.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Basic information associated with your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Profile details are managed from your account. In a future update, this section can be connected to
              editable profile fields.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure how you receive alerts and reminders.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Manage email, SMS, and in-app notification preferences.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/notifications/settings">Open notification settings</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Password and session management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {status === "password_changed" && (
                <p className="text-xs font-medium text-emerald-700">
                  Your password has been updated. Use the new password the next time you sign in.
                </p>
              )}
              {error && (
                <p className="text-xs font-medium text-red-700">
                  {error === "invalid_current_password" && "Current password is incorrect."}
                  {error === "password_mismatch" && "New password and confirmation do not match."}
                  {error === "password_too_short" && "New password must be at least 8 characters long."}
                  {error === "password_update_failed" && "Unable to update password. Please try again."}
                  {error === "password_incomplete" && "Please fill in all password fields."}
                  {![
                    "invalid_current_password",
                    "password_mismatch",
                    "password_too_short",
                    "password_update_failed",
                    "password_incomplete",
                  ].includes(error) && "Unable to change password. Please try again."}
                </p>
              )}
              <form action={changePassword} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="current_password" className="text-xs font-medium text-muted-foreground">
                    Current password
                  </label>
                  <input
                    id="current_password"
                    name="current_password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="new_password" className="text-xs font-medium text-muted-foreground">
                    New password
                  </label>
                  <input
                    id="new_password"
                    name="new_password"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="confirm_password" className="text-xs font-medium text-muted-foreground">
                    Confirm new password
                  </label>
                  <input
                    id="confirm_password"
                    name="confirm_password"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm">
                    Change password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
