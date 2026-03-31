import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DashboardPageShell } from "@/components/dashboard-page-shell"

export const revalidate = 0
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

type AcceptedRow = {
  provider: string
  event_id: string
  created_at: string
}

type RejectedRow = {
  occurred_at: string
  action: string
  metadata: {
    reason?: string
    fingerprint?: string
    provider?: string
  } | null
}

type MutatedRow = {
  occurred_at: string
  action: string
  resource_id: string | null
  metadata: {
    event_id?: string
    amount?: number
    old_status?: string | null
    new_status?: string | null
  } | null
}

export default async function WebhookEventsPage(props: {
  searchParams?: Promise<{ page?: string; page_size?: string }>
}) {
  const { user, profile } = await getSessionUserAndProfile()
  if (!user) redirect("/auth/login")

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const searchParams = props.searchParams ? await props.searchParams : {}
  const currentPage = Math.max(1, Number.parseInt((searchParams.page || "1").trim(), 10) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt((searchParams.page_size || String(DEFAULT_PAGE_SIZE)).trim(), 10) || DEFAULT_PAGE_SIZE),
  )
  const from = (currentPage - 1) * pageSize
  const to = from + pageSize

  const [{ data: acceptedRows }, { data: rejectedRows }, { data: mutatedRows }] = await Promise.all([
    supabase
      .from("webhook_replay_events")
      .select("provider, event_id, created_at")
      .eq("provider", "mobile_money")
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, metadata")
      .eq("action", "webhook.mobile_money.rejected")
      .order("occurred_at", { ascending: false })
      .range(from, to),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, resource_id, metadata")
      .eq("action", "webhook.mobile_money.invoice_mutated")
      .order("occurred_at", { ascending: false })
      .range(from, to),
  ])

  const acceptedAll = (acceptedRows || []) as AcceptedRow[]
  const rejectedAll = (rejectedRows || []) as RejectedRow[]
  const mutatedAll = (mutatedRows || []) as MutatedRow[]
  const accepted = acceptedAll.slice(0, pageSize)
  const rejected = rejectedAll.slice(0, pageSize)
  const mutated = mutatedAll.slice(0, pageSize)
  const hasNextPage = acceptedAll.length > pageSize || rejectedAll.length > pageSize || mutatedAll.length > pageSize
  const buildQuery = (page: number) => {
    const params = new URLSearchParams()
    if (page > 1) params.set("page", String(page))
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("page_size", String(pageSize))
    return params.toString()
  }

  return (
    <DashboardPageShell
      title="Webhook Events Monitor"
      description="Recent accepted and rejected mobile money webhook events."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/admin">Back to Admin</Link>
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span>
          Page {currentPage} · showing up to {pageSize} rows per section.
        </span>
        <div className="flex items-center gap-2">
          {currentPage > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/admin/webhook-events?${buildQuery(currentPage - 1)}`}>Previous</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Previous
            </Button>
          )}
          {hasNextPage ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/admin/webhook-events?${buildQuery(currentPage + 1)}`}>Next</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Next
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accepted events</CardTitle>
            <CardDescription>From persistent replay store (`webhook_replay_events`).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Event ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accepted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No accepted webhook rows found.
                    </TableCell>
                  </TableRow>
                ) : (
                  accepted.map((row) => (
                    <TableRow key={`${row.provider}:${row.event_id}:${row.created_at}`}>
                      <TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell>{row.provider}</TableCell>
                      <TableCell className="font-mono text-xs">{row.event_id}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rejected events</CardTitle>
            <CardDescription>From `audit_logs` action `webhook.mobile_money.rejected`.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Fingerprint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rejected.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No rejected webhook rows found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rejected.map((row, index) => (
                    <TableRow key={`${row.occurred_at}:${index}`}>
                      <TableCell className="whitespace-nowrap">{new Date(row.occurred_at).toLocaleString()}</TableCell>
                      <TableCell>{row.metadata?.reason || "unknown"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.metadata?.fingerprint || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice mutations</CardTitle>
          <CardDescription>From `audit_logs` action `webhook.mobile_money.invoice_mutated`.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Event ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mutated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No invoice mutation rows found.
                  </TableCell>
                </TableRow>
              ) : (
                mutated.map((row, index) => (
                  <TableRow key={`${row.occurred_at}:${index}`}>
                    <TableCell className="whitespace-nowrap">{new Date(row.occurred_at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{row.resource_id || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.metadata?.event_id || "-"}</TableCell>
                    <TableCell>{typeof row.metadata?.amount === "number" ? row.metadata.amount.toLocaleString() : "-"}</TableCell>
                    <TableCell>{`${row.metadata?.old_status || "unknown"} -> ${row.metadata?.new_status || "unknown"}`}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardPageShell>
  )
}
