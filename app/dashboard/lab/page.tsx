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

interface LabTestRow {
  id: string
  test_number: string
  test_type: string
  test_category: string
  priority: string
  status: string
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?: { name?: string | null } | null
  } | null
}

export default async function LabTestsPage() {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "lab.manage")) {
    redirect("/dashboard")
  }

  // Fetch lab tests
  const { data: labTests } = await supabase
    .from("lab_tests")
    .select(`
      *,
      patients(full_name, patient_number),
      profiles(full_name),
      visits(is_free_health_care,
        facilities(name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "default"
      case "in_progress":
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Laboratory Tests</h1>
          <p className="text-pretty text-muted-foreground">Manage lab test orders and results</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/lab/new">
            <Plus className="mr-2 h-4 w-4" />
            New Lab Test
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Lab Tests</CardTitle>
          <CardDescription>Recent lab test orders and results</CardDescription>
        </CardHeader>
        <CardContent>
          <TableCard title="All Lab Tests" description="Recent lab test orders and results">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Test Type</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labTests && labTests.length > 0 ? (
                  labTests.map((test: LabTestRow) => (
                    <TableRow key={test.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{test.test_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{test.patients?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{test.patients?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{test.test_type}</p>
                          <p className="text-sm text-muted-foreground">{test.test_category}</p>
                        </div>
                      </TableCell>
                      <TableCell>Dr. {test.profiles?.full_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                          {test.visits?.facilities?.name && <span>{test.visits.facilities.name}</span>}
                          {test.visits?.is_free_health_care && (
                            <Badge variant="default" className="w-fit text-[10px] font-normal">
                              Free Health Care visit
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityColor(test.priority)}>{test.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(test.status)}>{test.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/lab/${test.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No lab tests found
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
