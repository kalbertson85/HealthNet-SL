import { redirect } from "next/navigation"
import Link from "next/link"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"

interface SurgeryRow {
  id: string
  procedure_name: string
  procedure_type: string | null
  status: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?: { name?: string | null; code?: string | null } | null
  } | null
}

export default async function SurgeryPage() {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "inpatient.manage")) {
    redirect("/dashboard")
  }

  const { data } = await supabase
    .from("surgeries")
    .select(
      `*,
       patients(full_name, patient_number),
       profiles:surgeon_id(full_name),
       visits(is_free_health_care,
         facilities(name, code)
       )
      `,
    )
    .order("scheduled_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50)

  const rows = (data || []) as SurgeryRow[]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Surgery</h1>
          <p className="text-pretty text-muted-foreground">View and track surgical procedures linked to visits.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Surgeries</CardTitle>
          <CardDescription>Procedures recorded in the system, with Free Health Care and facility context.</CardDescription>
        </CardHeader>
        <CardContent>
          <TableCard title="Surgeries" description="Recent surgical procedures.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Procedure</TableHead>
                  <TableHead>Surgeon</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No surgeries recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.patients?.full_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{row.patients?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{row.procedure_name}</p>
                          {row.procedure_type && (
                            <p className="text-xs text-muted-foreground">{row.procedure_type}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">Dr. {row.profiles?.full_name || "Unknown"}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          {row.visits?.is_free_health_care && (
                            <Badge variant="secondary" className="w-fit text-[10px]">
                              Free Health Care
                            </Badge>
                          )}
                          {row.visits?.facilities?.name && (
                            <span className="text-muted-foreground">
                              {row.visits.facilities.name}
                              {row.visits.facilities.code ? ` (${row.visits.facilities.code})` : ""}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-xs text-muted-foreground">
                          {row.scheduled_at && (
                            <span>Scheduled: {new Date(row.scheduled_at).toLocaleString()}</span>
                          )}
                          {row.started_at && <span>Started: {new Date(row.started_at).toLocaleString()}</span>}
                          {row.ended_at && <span>Ended: {new Date(row.ended_at).toLocaleString()}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "completed" ? "secondary" : "default"}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/surgery/${row.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}
