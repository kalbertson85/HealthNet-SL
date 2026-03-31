import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

interface BillingVisitRow {
  id: string
  visit_status: string
  diagnosis: string | null
  patients?: {
    full_name?: string | null
    patient_number?: string | null
  } | null
}

interface BillingPageSearchParams {
  q?: string
  status?: string
  company_id?: string
}

export default async function BillingPage(props: { searchParams: Promise<BillingPageSearchParams> }) {
  const supabase = await createServerClient()

  const { user } = await getSessionUserAndProfile()

  if (!user) {
    // Dashboard layout should normally guard this, but keep a direct check for safety.
    redirect("/auth/login")
  }

  if (!can(user, "billing.manage")) {
    // Only billing staff and admins should see this module.
    redirect("/dashboard")
  }

  const searchParams = await props.searchParams
  const query = (searchParams.q || "").toLowerCase().trim()
  const statusFilter = (searchParams.status || "all").toLowerCase().trim()
  const companyFilterId = ((searchParams.company_id as string | undefined) || "").trim() || null

  const [{ data: invoices }, { data: billingVisits, error: visitsError }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`
        *,
        patients(full_name, patient_number),
        companies(name)
      `)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("visits")
      .select(
        `id, visit_status, diagnosis,
         patients(full_name, patient_number)`
      )
      .eq("visit_status", "billing_pending")
      .order("created_at", { ascending: true }),
  ])

  if (visitsError) {
    console.error("[v0] Error loading visits awaiting billing:", visitsError.message || visitsError)
  }

  const visitsToBill = (billingVisits || []) as BillingVisitRow[]

  const normalizedQuery = query
  const filteredVisits = normalizedQuery
    ? visitsToBill.filter((visit) => {
        const haystack = [visit.patients?.full_name, visit.patients?.patient_number, visit.diagnosis]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
    : visitsToBill

  let filteredInvoices = invoices || []

  if (statusFilter !== "all") {
    filteredInvoices = filteredInvoices.filter((invoice) => invoice.status?.toLowerCase() === statusFilter)
  }

  if (companyFilterId) {
    filteredInvoices = filteredInvoices.filter((invoice) => {
      const payerType = (invoice.payer_type as string | undefined) || "patient"
      if (payerType !== "company") return false
      return (invoice.company_id as string | null) === companyFilterId
    })
  }

  if (normalizedQuery) {
    filteredInvoices = filteredInvoices.filter((invoice) => {
      const haystack = [
        invoice.invoice_number,
        invoice.status,
        invoice.patients?.full_name,
        invoice.patients?.patient_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }

  const totalInvoiced = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)
  const totalPaid = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0)
  const totalOutstanding = totalInvoiced - totalPaid
  const overdueCount = filteredInvoices.filter((invoice) => invoice.status === "overdue").length

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "secondary"
      case "partial":
        return "default"
      case "pending":
        return "default"
      case "overdue":
        return "destructive"
      default:
        return "secondary"
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Billing & Invoicing</h1>
          <p className="text-pretty text-muted-foreground">Manage patient invoices and payments</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/billing/new">
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visits awaiting billing</CardTitle>
          <CardDescription>Patients whose visits are ready for invoice generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <form method="GET" className="flex gap-2 text-xs">
            <input
              type="text"
              name="q"
              defaultValue={query}
              className="flex h-8 w-full max-w-xs rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Search by patient name or number"
            />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>

          {filteredVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits currently waiting for billing.</p>
          ) : (
            <div className="space-y-2">
              {filteredVisits.map((visit) => (
                <div key={visit.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div>
                    <p className="font-medium">{visit.patients?.full_name || "Unknown patient"}</p>
                    <p className="text-xs text-muted-foreground">
                      {visit.patients?.patient_number || "–"}
                      {visit.diagnosis ? ` · ${visit.diagnosis.slice(0, 80)}` : ""}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/billing/visit/${visit.id}`}>Bill visit</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
          <CardDescription>Recent invoices and payment status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form method="GET" className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              name="q"
              defaultValue={query}
              className="flex h-8 w-full max-w-xs rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Search by invoice #, patient, or status"
            />
            <select
              name="status"
              defaultValue={statusFilter || "all"}
              className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Filter by invoice status"
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
            </select>
            {companyFilterId && <input type="hidden" name="company_id" value={companyFilterId} />}
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </form>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Invoiced</p>
              <p className="text-2xl font-bold">Le {totalInvoiced.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Paid</p>
              <p className="text-2xl font-bold text-emerald-600">Le {totalPaid.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Outstanding / Overdue</p>
              <p className="text-base font-semibold">Le {totalOutstanding.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{overdueCount} overdue invoice{overdueCount === 1 ? "" : "s"}</p>
            </div>
          </div>

          <TableCard title="All Invoices" description="Recent invoices and payment status">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices && filteredInvoices.length > 0 ? (
                  filteredInvoices.map((invoice) => {
                    const balance = Number(invoice.total_amount) - Number(invoice.paid_amount || 0)
                    const payerType = (invoice.payer_type as string | undefined) || "patient"
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {payerType === "company"
                                ? invoice.companies?.name || "Company"
                                : invoice.patients?.full_name || "Patient"}
                            </p>
                            {payerType === "company" ? (
                              <p className="text-xs text-muted-foreground">Company payer</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">{invoice.patients?.patient_number}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{new Date(invoice.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>Le {Number(invoice.total_amount).toLocaleString()}</TableCell>
                        <TableCell>Le {Number(invoice.paid_amount || 0).toLocaleString()}</TableCell>
                        <TableCell>Le {balance.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/dashboard/billing/${invoice.id}`}>View</Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                              PDF
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}
