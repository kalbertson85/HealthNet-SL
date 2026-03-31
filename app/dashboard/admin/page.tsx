import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Database, FileText } from "lucide-react"

export default async function AdminPage() {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export")) {
    redirect("/dashboard")
  }

  const [{ count: patientsCount }, { count: invoicesCount }] = await Promise.all([
    supabase.from("patients").select("*", { count: "exact", head: true }),
    supabase.from("invoices").select("*", { count: "exact", head: true }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">
          Administrative tools for data export and system configuration.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              Data Export & Backup
            </CardTitle>
            <CardDescription>
              Export core hospital data for reporting, backup, or compliance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Use the export tools to download patient, appointment, prescription, lab, and billing data as CSV
              files. These exports can be used for offline analysis or regulatory submissions.
            </p>
            <p>
              Current dataset sizes:
              <br />
              Patients: {patientsCount ?? 0}
              <br />
              Invoices: {invoicesCount ?? 0}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/admin/export">Open data export</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              System Logs & Auditing
            </CardTitle>
            <CardDescription>
              High-level overview of system activity and audit logging.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Audit logs are recorded for key clinical and billing actions such as lab result entry and pharmacy
              dispensing. A dedicated audit viewer can be added here in a future update.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/audit-logs">View audit logs</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/system-activity">System activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/reset-activity">Password reset activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/appointment-activity">Appointment activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/billing-activity">Billing activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/emergency-activity">Emergency activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/lab-activity">Lab activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/pharmacy-activity">Pharmacy activity</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/webhook-events">Webhook events monitor</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              System Settings
            </CardTitle>
            <CardDescription>
              Configure hospital branding and company billing profiles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Hospital settings</span>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/settings/hospital">Open</Link>
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span>Company billing</span>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/settings/companies">Open</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              User Management
            </CardTitle>
            <CardDescription>View staff accounts and assign application roles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Use this tool to review staff profiles and set roles such as doctor, nurse, pharmacist, and cashier.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/admin/users">Manage users</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
