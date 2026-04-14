import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency, formatNumber } from "@/lib/locale-format"
import type { DashboardRbacUser } from "@/lib/dashboard/queries"

export async function DashboardRoleFocusSection({ rbacUser }: { rbacUser: DashboardRbacUser }) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
  const role = (rbacUser.role || "").toLowerCase()

  if (role === "doctor") {
    const [{ count: pendingVisits }, { count: pendingLabs }, { count: pendingRadiology }] = await Promise.all([
      supabase.from("visits").select("id", { count: "exact", head: true }).in("visit_status", ["doctor_pending", "doctor_review"]),
      supabase.from("lab_tests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("radiology_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "scheduled"]),
    ])

    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Doctor focus</CardTitle>
            <CardDescription>Clinical queue and results needing review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(pendingVisits || 0, settings)}</p>
            <p className="text-xs text-muted-foreground">Patients are waiting for consultation or return review.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/doctor">Open doctor workspace</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending lab results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(pendingLabs || 0, settings)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/lab?status=pending">Review lab queue</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending radiology</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(pendingRadiology || 0, settings)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/radiology">Review radiology</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (role === "nurse" || role === "nursing") {
    const [{ count: activeAdmissions }, { count: notesToday }] = await Promise.all([
      supabase.from("admissions").select("id", { count: "exact", head: true }).eq("status", "admitted"),
      supabase.from("visit_nursing_notes").select("id", { count: "exact", head: true }).gte("performed_at", new Date().toISOString().slice(0, 10)),
    ])

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Nursing focus</CardTitle>
            <CardDescription>Current inpatient workload and ward documentation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(activeAdmissions || 0, settings)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/nursing">Open nursing workspace</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Notes recorded today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(notesToday || 0, settings)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/inpatient">Open inpatient list</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (role === "pharmacist" || role === "pharmacy") {
    const [{ count: pendingPrescriptions }, { count: lowStockCount }] = await Promise.all([
      supabase.from("prescriptions").select("id", { count: "exact", head: true }).in("status", ["ready", "in_progress"]),
      supabase.from("medication_stock").select("id", { count: "exact", head: true }).filter("quantity_on_hand", "lte", "reorder_level"),
    ])

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pharmacy focus</CardTitle>
            <CardDescription>Dispensing queue and inventory risks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(pendingPrescriptions || 0, settings)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/prescriptions">Open dispensing queue</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Low stock items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(lowStockCount || 0, settings)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/pharmacy?stock_filter=low">Review stock</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (role === "admin" || role === "super_admin" || role === "facility_admin") {
    const [{ data: paidInvoices }, { count: openBatches }] = await Promise.all([
      supabase
        .from("invoices")
        .select("paid_amount")
        .gte("payment_date", monthStart)
        .not("payment_date", "is", null)
        .limit(500),
      supabase.from("insurance_billing_batches").select("id", { count: "exact", head: true }).in("status", ["draft", "submitted"]),
    ])

    const monthRevenue = (paidInvoices || []).reduce((sum, row) => sum + Number(row.paid_amount || 0), 0)

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Admin focus</CardTitle>
            <CardDescription>Financial oversight and insurer batch follow-up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatCurrency(monthRevenue, settings)}</p>
            <p className="text-xs text-muted-foreground">Paid revenue recorded this month.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/reports">Open reports</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Insurance batches awaiting action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{formatNumber(openBatches || 0, settings)}</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/billing/insurance">Open insurance billing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
