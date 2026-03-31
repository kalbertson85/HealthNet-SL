import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { ROLES } from "@/lib/utils"

interface PasswordResetEventRow {
  id: string
  email: string
  created_at: string
}

interface ResetActivityPageProps {
  searchParams?: Promise<{
    q?: string
    from?: string
    to?: string
  }>
}

export const revalidate = 0

export default async function ResetActivityPage({ searchParams }: ResetActivityPageProps) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const role = profile?.role ?? user.role
  if (role !== ROLES.ADMIN && role !== ROLES.FACILITY_ADMIN) {
    redirect("/dashboard")
  }

  const sp = searchParams ? await searchParams : undefined

  const q = (sp?.q || "").trim().toLowerCase() || null
  const fromFilter = (sp?.from || "").trim() || null
  const toFilter = (sp?.to || "").trim() || null

  let query = supabase
    .from("password_reset_events")
    .select("id, email, created_at")
    .order("created_at", { ascending: false })
    .limit(200)

  if (fromFilter) {
    query = query.gte("created_at", fromFilter)
  }
  if (toFilter) {
    query = query.lte("created_at", toFilter)
  }

  const { data, error } = await query

  if (error) {
    console.error("[v0] Error loading password reset events", error)
  }

  let rows = (data || []) as PasswordResetEventRow[]

  if (q) {
    rows = rows.filter((row) => row.email.toLowerCase().includes(q))
  }

  const formatDateTime = (value: string | null) => {
    if (!value) return ""
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  const totalInWindow = rows.length
  const uniqueEmails = new Set(rows.map((r) => r.email.toLowerCase())).size

  const countsByEmail = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.email.toLowerCase()
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const MAX_PER_EMAIL = 5
  let topEmail: string | null = null
  let topCount = 0
  for (const [email, count] of Object.entries(countsByEmail)) {
    if (count > topCount) {
      topCount = count
      topEmail = email
    }
  }

  const thresholdExceeded = topEmail !== null && topCount > MAX_PER_EMAIL

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
            <h1 className="text-3xl font-bold tracking-tight">Password reset activity</h1>
            <p className="text-muted-foreground">
              Read-only view of recent password reset requests, for monitoring suspicious activity.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by email and date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto w-full max-w-4xl">
            <form method="GET" className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-3 items-end">
                <div className="space-y-1">
                  <label htmlFor="q" className="text-xs font-medium text-muted-foreground">
                    Email contains
                  </label>
                  <input
                    id="q"
                    name="q"
                    defaultValue={q || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
                    From
                  </label>
                  <input
                    id="from"
                    name="from"
                    type="datetime-local"
                    defaultValue={fromFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
                    To
                  </label>
                  <input
                    id="to"
                    name="to"
                    type="datetime-local"
                    defaultValue={toFilter || ""}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm">
                  Apply filters
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>High-level view of reset requests in the current filter window.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Reset requests (window)</p>
            <p className="text-2xl font-bold">{totalInWindow}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Unique emails</p>
            <p className="text-2xl font-bold">{uniqueEmails}</p>
          </div>
          <div className="space-y-1">
            {thresholdExceeded ? (
              <>
                <p className="text-xs font-medium text-destructive">
                  High reset activity detected for {topEmail} ({topCount} requests in this window).
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Consider reviewing this account in the audit logs or temporarily blocking it if activity looks
                  suspicious.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Use the filters above to narrow by email or time window. Rate limiting is enforced per email and
                browser.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent reset requests</CardTitle>
          <CardDescription>Showing up to 200 matching entries.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                      No password reset events found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.email}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
