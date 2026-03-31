import Link from "next/link"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"

export const revalidate = 0

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

export default async function WebhookEventsPage() {
  const { user, profile } = await getSessionUserAndProfile()
  if (!user) redirect("/auth/login")

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()

  const [{ data: acceptedRows }, { data: rejectedRows }, { data: mutatedRows }] = await Promise.all([
    supabase
      .from("webhook_replay_events")
      .select("provider, event_id, created_at")
      .eq("provider", "mobile_money")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, metadata")
      .eq("action", "webhook.mobile_money.rejected")
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase
      .from("audit_logs")
      .select("occurred_at, action, resource_id, metadata")
      .eq("action", "webhook.mobile_money.invoice_mutated")
      .order("occurred_at", { ascending: false })
      .limit(100),
  ])

  const accepted = (acceptedRows || []) as AcceptedRow[]
  const rejected = (rejectedRows || []) as RejectedRow[]
  const mutated = (mutatedRows || []) as MutatedRow[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhook Events Monitor</h1>
          <p className="text-muted-foreground">Recent accepted and rejected mobile money webhook events.</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/admin">Back to Admin</Link>
        </Button>
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
    </div>
  )
}
