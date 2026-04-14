import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardPageShell } from "@/components/dashboard-page-shell"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Database, FileText } from "lucide-react"
import { fetchDataConsistencyCounts } from "@/lib/data-consistency"

export default async function AdminPage() {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export")) {
    redirect("/dashboard")
  }

  const [{ count: patientsCount }, { count: invoicesCount }, consistency] = await Promise.all([
    supabase.from("patients").select("*", { count: "exact", head: true }),
    supabase.from("invoices").select("*", { count: "exact", head: true }),
    fetchDataConsistencyCounts(supabase as unknown as Parameters<typeof fetchDataConsistencyCounts>[0]),
  ])

  return (
    <DashboardPageShell title="Admin" description="Administrative tools for data export and system configuration.">
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
              dispensing. Use the activity and audit links below to trace workflow changes across the system.
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
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/data-cleanup">Data cleanup</Link>
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
              <div className="flex items-center justify-between">
                <span>Insurance batch billing</span>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/billing/insurance">Open</Link>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              Workflow Integrity Monitor
            </CardTitle>
            <CardDescription>
              Live checks for missing billing, dispensing backlogs, and insurance batch inconsistencies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Visits without billing: {consistency.visits_without_billing}
              <br />
              Open prescriptions not dispensed: {consistency.open_prescriptions_without_dispense}
              <br />
              Prescriptions without items: {consistency.prescriptions_without_items}
              <br />
              Invoices without items: {consistency.invoices_without_items}
              <br />
              Queue in progress without visit: {consistency.queue_in_progress_without_visit}
              <br />
              Insurance batches missing totals: {consistency.insurance_batches_without_totals}
              <br />
              Insurance batches with amount mismatch: {consistency.insurance_batches_with_mismatch}
              <br />
              Discharged admissions missing summary: {consistency.discharged_admissions_missing_summary}
            </p>
            <p className="text-xs">
              Source: {consistency.source}
              {consistency.truncated ? " (truncated fallback scan)" : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/api/admin/data-consistency">Open JSON metrics</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/admin/data-cleanup">Open data cleanup</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardPageShell>
  )
}
