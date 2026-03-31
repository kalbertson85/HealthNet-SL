import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"
import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  const { search: searchParam } = await searchParams
  const searchQuery = searchParam || ""

  // Fetch patients with optional search
  let query = supabase.from("patients").select("*").order("created_at", { ascending: false })

  if (searchQuery) {
    query = query.or(
      `full_name.ilike.%${searchQuery}%,patient_number.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%`,
    )
  }

  const { data: patients } = await query

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Patients</h1>
          <p className="text-pretty text-muted-foreground">Manage patient records and information</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/patients/new">
            <Plus className="mr-2 h-4 w-4" />
            Register Patient
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Directory</CardTitle>
          <CardDescription>Search and view all registered patients</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action="/dashboard/patients" method="get">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="search"
                placeholder="Search by name, patient number, or phone..."
                defaultValue={searchQuery}
                className="pl-9"
              />
            </div>
          </form>

          <TableCard title="All Patients" description="Full list of registered patients">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient Number</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients && patients.length > 0 ? (
                  patients.map((patient) => (
                    <TableRow key={patient.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{patient.patient_number}</TableCell>
                      <TableCell>{patient.full_name}</TableCell>
                      <TableCell className="capitalize">{patient.gender}</TableCell>
                      <TableCell>{patient.phone_number || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant={patient.status === "active" ? "default" : "secondary"}>{patient.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/patients/${patient.id}`}>View</Link>
                        </Button>
                        {can(rbacUser, "appointments.manage") ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/appointments/new?patient_id=${patient.id}`}>Appointment</Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            title="You don't have permission to book appointments."
                          >
                            Appointment
                          </Button>
                        )}
                        {can(rbacUser, "billing.manage") ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/billing/new?patient_id=${patient.id}`}>Invoice</Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            title="You don't have permission to create invoices."
                          >
                            Invoice
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {searchQuery ? "No patients found matching your search" : "No patients registered yet"}
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
