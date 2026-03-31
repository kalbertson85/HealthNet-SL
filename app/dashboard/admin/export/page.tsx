import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Database, Users, Calendar, FileText, Pill, DollarSign, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"

export default async function ExportPage() {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    redirect("/dashboard")
  }

  // Get data counts
  const [
    { count: patientsCount },
    { count: appointmentsCount },
    { count: prescriptionsCount },
    { count: invoicesCount },
    { count: labTestsCount },
  ] = await Promise.all([
    supabase.from("patients").select("*", { count: "exact", head: true }),
    supabase.from("appointments").select("*", { count: "exact", head: true }),
    supabase.from("prescriptions").select("*", { count: "exact", head: true }),
    supabase.from("invoices").select("*", { count: "exact", head: true }),
    supabase.from("lab_tests").select("*", { count: "exact", head: true }),
  ])

  const exportOptions = [
    {
      title: "Patients Database",
      description: "Export all patient records including demographics and medical history",
      icon: Users,
      count: patientsCount,
      endpoint: "/api/export/patients",
      color: "text-blue-600",
    },
    {
      title: "Appointments",
      description: "Export appointment schedules and history",
      icon: Calendar,
      count: appointmentsCount,
      endpoint: "/api/export/appointments",
      color: "text-green-600",
    },
    {
      title: "Prescriptions",
      description: "Export prescription records and medication history",
      icon: Pill,
      count: prescriptionsCount,
      endpoint: "/api/export/prescriptions",
      color: "text-purple-600",
    },
    {
      title: "Lab Tests",
      description: "Export laboratory test orders and results",
      icon: FileText,
      count: labTestsCount,
      endpoint: "/api/export/lab-tests",
      color: "text-orange-600",
    },
    {
      title: "Billing & Invoices",
      description: "Export financial records, invoices, and payments",
      icon: DollarSign,
      count: invoicesCount,
      endpoint: "/api/export/invoices",
      color: "text-teal-600",
    },
    {
      title: "Complete Backup",
      description: "Export all system data in a single comprehensive backup",
      icon: Database,
      count: null,
      endpoint: "/api/export/complete",
      color: "text-red-600",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Data Export & Backup</h1>
            <p className="text-muted-foreground">
              Export hospital data for backup, reporting, or compliance purposes
            </p>
          </div>
        </div>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Important Information</CardTitle>
          <CardDescription className="text-blue-800">
            Exported data contains sensitive patient information. Please ensure proper handling and storage in
            compliance with data protection regulations.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {exportOptions.map((option) => (
          <Card key={option.title}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-slate-100 ${option.color}`}>
                    <option.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{option.title}</CardTitle>
                    {option.count !== null && (
                      <p className="text-sm text-muted-foreground">
                        {option.count} record{option.count === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{option.description}</p>
              <form action={option.endpoint} method="GET">
                <Button type="submit" className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Export as CSV
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automated Backups</CardTitle>
          <CardDescription>Configure automated daily or weekly backups for your hospital data</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Automated backup functionality coming soon. Contact support for enterprise backup solutions.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
