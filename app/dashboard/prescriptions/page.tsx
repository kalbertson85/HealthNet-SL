import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableCard } from "@/components/table-card"

interface PrescriptionRow {
  id: string
  prescription_number: string
  status: string
  created_at: string
  patient_id: string
  patients?: { full_name?: string | null; patient_number?: string | null } | null
  profiles?: { full_name?: string | null } | null
}

export default async function PrescriptionsPage() {
  const supabase = await createServerClient()

  // Fetch prescriptions
  const { data: prescriptions } = await supabase
    .from("prescriptions")
    .select(`
      *,
      patients(full_name, patient_number),
      profiles(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(50)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "default"
      case "dispensed":
        return "secondary"
      default:
        return "secondary"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Prescriptions</h1>
          <p className="text-pretty text-muted-foreground">Manage patient prescriptions and medications</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/prescriptions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Prescription
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Prescriptions</CardTitle>
          <CardDescription>Recent prescriptions ordered for patients</CardDescription>
        </CardHeader>
        <CardContent>
          <TableCard title="All Prescriptions" description="Recent prescriptions ordered for patients">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescription #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prescriptions && prescriptions.length > 0 ? (
                  prescriptions.map((prescription: PrescriptionRow) => (
                    <TableRow key={prescription.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{prescription.prescription_number}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{prescription.patients?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{prescription.patients?.patient_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>Dr. {prescription.profiles?.full_name}</TableCell>
                      <TableCell>{new Date(prescription.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(prescription.status)}>{prescription.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/prescriptions/${prescription.id}`}>View</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/appointments/new?patient_id=${prescription.patient_id}`}>
                            Appointment
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/billing/new?patient_id=${prescription.patient_id}`}>Invoice</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No prescriptions found
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
