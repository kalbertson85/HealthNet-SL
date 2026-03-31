import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

export const revalidate = 0

interface ClaimRow {
  id: string
  claim_number: string | null
  status: string
  claimed_amount: number | null
  approved_amount: number | null
  created_at: string
  invoices?: {
    invoice_number?: string | null
    total_amount?: number | null
    patients?: { full_name?: string | null; patient_number?: string | null } | null
  } | null
  companies?: { name?: string | null } | null
}

interface ClaimsPageSearchParams {
  status?: string
  company_id?: string
}

export default async function ClaimsPage(props: { searchParams: Promise<ClaimsPageSearchParams> }) {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can({ id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }, "billing.manage")) {
    redirect("/dashboard")
  }

  const searchParams = await props.searchParams
  const statusFilter = (searchParams.status || "all").toLowerCase().trim()
  const companyFilterId = ((searchParams.company_id as string | undefined) || "").trim() || null

  const { data: claimsData } = await supabase
    .from("insurance_claims")
    .select(
      `id, claim_number, status, claimed_amount, approved_amount, created_at,
       invoices(invoice_number, total_amount, patients(full_name, patient_number)),
       companies(name)`,
    )
    .order("created_at", { ascending: false })
    .limit(100)

  let claims = (claimsData || []) as ClaimRow[]

  if (statusFilter !== "all") {
    claims = claims.filter((c) => c.status.toLowerCase() === statusFilter)
  }

  if (companyFilterId) {
    claims = claims.filter((c) => (c as any).company_id === companyFilterId)
  }

  const statusVariant = (status: string): "default" | "secondary" | "destructive" => {
    switch (status) {
      case "prepared":
      case "submitted":
        return "default"
      case "paid":
        return "secondary"
      case "rejected":
      case "cancelled":
        return "destructive"
      default:
        return "default"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insurance Claims</h1>
          <p className="text-sm text-muted-foreground">
            Track company and insurance claims linked to invoices.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/billing">Back to Billing</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent claims</CardTitle>
          <CardDescription>Last 100 insurance claims by created date.</CardDescription>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">No insurance claims have been recorded yet.</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Claimed</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => {
                  const patientName = claim.invoices?.patients?.full_name || "Unknown"
                  const patientNumber = claim.invoices?.patients?.patient_number || "-"
                  const companyName = claim.companies?.name || "-"

                  return (
                    <TableRow key={claim.id}>
                      <TableCell>{claim.claim_number || "(auto)"}</TableCell>
                      <TableCell>
                        {claim.invoices?.invoice_number ? (
                          <Link
                            href={`/dashboard/billing/${(claim as any).invoice_id ?? ""}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {claim.invoices.invoice_number}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-xs">{patientName}</p>
                          <p className="text-[11px] text-muted-foreground">{patientNumber}</p>
                        </div>
                      </TableCell>
                      <TableCell>{companyName}</TableCell>
                      <TableCell>Le {Number(claim.claimed_amount || 0).toLocaleString()}</TableCell>
                      <TableCell>Le {Number(claim.approved_amount || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(claim.status)} className="capitalize text-[11px]">
                          {claim.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(claim.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
