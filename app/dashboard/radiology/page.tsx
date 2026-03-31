import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

interface RadiologyRequestRow {
  id: string
  modality: string
  study_type: string
  priority: string
  status: string
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?: { name?: string | null } | null
  } | null
}

export default async function RadiologyPage() {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "lab.manage")) {
    redirect("/dashboard")
  }

  const { data: requests } = await supabase
    .from("radiology_requests")
    .select(
      `*,
       patients(full_name, patient_number),
       profiles(full_name),
       visits(is_free_health_care,
         facilities(name)
       )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(50)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "default"
      case "scheduled":
        return "default"
      case "completed":
        return "secondary"
      case "cancelled":
        return "destructive"
      default:
        return "secondary"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "stat":
        return "destructive"
      case "urgent":
        return "default"
      case "routine":
        return "secondary"
      default:
        return "secondary"
    }
  }

  const rows = (requests || []) as RadiologyRequestRow[]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Radiology</h1>
          <p className="text-pretty text-muted-foreground">Manage imaging requests and results</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Radiology Requests</CardTitle>
          <CardDescription>Recent imaging requests linked to visits</CardDescription>
        </CardHeader>
        <CardContent>
          <TableCard title="Radiology Requests" description="Recent imaging requests and results">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Study</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((req) => (
                    <TableRow key={req.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{req.patients?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{req.patients?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{req.study_type}</p>
                          <p className="text-sm text-muted-foreground uppercase">{req.modality}</p>
                        </div>
                      </TableCell>
                      <TableCell>Dr. {req.profiles?.full_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {req.visits?.facilities?.name && (
                            <span>{req.visits.facilities.name}</span>
                          )}
                          {req.visits?.is_free_health_care && (
                            <Badge variant="default" className="w-fit text-[10px] font-normal">
                              Free Health Care visit
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityColor(req.priority)}>{req.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(req.status)}>{req.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/radiology/${req.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No radiology requests found
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
