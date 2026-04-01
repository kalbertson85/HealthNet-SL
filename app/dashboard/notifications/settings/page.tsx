import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Mail, MessageSquare, Smartphone } from "lucide-react"

async function updatePreferences(formData: FormData) {
  "use server"
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const preferences = {
    email_enabled: formData.get("email_enabled") === "on",
    sms_enabled: formData.get("sms_enabled") === "on",
    push_enabled: formData.get("push_enabled") === "on",
    appointment_reminders: formData.get("appointment_reminders") === "on",
    lab_results: formData.get("lab_results") === "on",
    prescription_ready: formData.get("prescription_ready") === "on",
    payment_reminders: formData.get("payment_reminders") === "on",
    system_alerts: formData.get("system_alerts") === "on",
  }

  await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, ...preferences })
    .eq("user_id", user.id)
}

export default async function NotificationSettingsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch preferences
  let { data: preferences } = await supabase
    .from("notification_preferences")
    .select(
      "user_id, email_enabled, sms_enabled, push_enabled, appointment_reminders, lab_results, prescription_ready, payment_reminders, system_alerts",
    )
    .eq("user_id", user.id)
    .single()

  // Create default preferences if none exist
  if (!preferences) {
    const { data: newPreferences } = await supabase
      .from("notification_preferences")
      .insert({ user_id: user.id })
      .select(
        "user_id, email_enabled, sms_enabled, push_enabled, appointment_reminders, lab_results, prescription_ready, payment_reminders, system_alerts",
      )
      .single()
    preferences = newPreferences
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Notification Settings</h1>
        <p className="text-muted-foreground">Manage how you receive notifications</p>
      </div>

      <form action={updatePreferences}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Channels</CardTitle>
              <CardDescription>Choose how you want to receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="email_enabled">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                  </div>
                </div>
                <Switch id="email_enabled" name="email_enabled" defaultChecked={preferences?.email_enabled ?? true} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="sms_enabled">SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive notifications via SMS</p>
                  </div>
                </div>
                <Switch id="sms_enabled" name="sms_enabled" defaultChecked={preferences?.sms_enabled ?? false} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="push_enabled">Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive push notifications in your browser</p>
                  </div>
                </div>
                <Switch id="push_enabled" name="push_enabled" defaultChecked={preferences?.push_enabled ?? true} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Types</CardTitle>
              <CardDescription>Choose which types of notifications you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="appointment_reminders">Appointment Reminders</Label>
                  <p className="text-sm text-muted-foreground">Get reminded about upcoming appointments</p>
                </div>
                <Switch
                  id="appointment_reminders"
                  name="appointment_reminders"
                  defaultChecked={preferences?.appointment_reminders ?? true}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="lab_results">Lab Results</Label>
                  <p className="text-sm text-muted-foreground">Be notified when lab results are ready</p>
                </div>
                <Switch id="lab_results" name="lab_results" defaultChecked={preferences?.lab_results ?? true} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="prescription_ready">Prescription Ready</Label>
                  <p className="text-sm text-muted-foreground">Get notified when prescriptions are ready</p>
                </div>
                <Switch
                  id="prescription_ready"
                  name="prescription_ready"
                  defaultChecked={preferences?.prescription_ready ?? true}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="payment_reminders">Payment Reminders</Label>
                  <p className="text-sm text-muted-foreground">Receive reminders about pending payments</p>
                </div>
                <Switch
                  id="payment_reminders"
                  name="payment_reminders"
                  defaultChecked={preferences?.payment_reminders ?? true}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="system_alerts">System Alerts</Label>
                  <p className="text-sm text-muted-foreground">Important system announcements and updates</p>
                </div>
                <Switch id="system_alerts" name="system_alerts" defaultChecked={preferences?.system_alerts ?? true} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg">
              Save Preferences
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
