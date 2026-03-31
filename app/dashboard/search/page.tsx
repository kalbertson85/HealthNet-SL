import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Search, User, Calendar, Pill } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const resolvedSearchParams = await searchParams
  const query = resolvedSearchParams.q || ""

  if (!query) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Global Search</h1>
          <p className="text-muted-foreground">Search across all hospital records</p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Enter a search term to find patients, appointments, prescriptions, and more
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Search across multiple tables
  const [{ data: patients }, { data: appointments }, { data: prescriptions }, { data: invoices }] = await Promise.all([
    supabase
      .from("patients")
      .select("*")
      .or(
        `first_name.ilike.%${query}%,last_name.ilike.%${query}%,patient_number.ilike.%${query}%,phone.ilike.%${query}%`,
      )
      .limit(10),
    supabase
      .from("appointments")
      .select("*, patient:patients(first_name, last_name, patient_number)")
      .or(`reason.ilike.%${query}%`)
      .limit(10),
    supabase
      .from("prescriptions")
      .select("*, patient:patients(first_name, last_name, patient_number)")
      .ilike("prescription_number", `%${query}%`)
      .limit(10),
    supabase
      .from("invoices")
      .select("*, patient:patients(first_name, last_name, patient_number)")
      .ilike("invoice_number", `%${query}%`)
      .limit(10),
  ])

  const totalResults =
    (patients?.length || 0) + (appointments?.length || 0) + (prescriptions?.length || 0) + (invoices?.length || 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Search Results</h1>
        <p className="text-muted-foreground">
          Found {totalResults} results for “{query}”
        </p>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All ({totalResults})</TabsTrigger>
          <TabsTrigger value="patients">Patients ({patients?.length || 0})</TabsTrigger>
          <TabsTrigger value="appointments">Appointments ({appointments?.length || 0})</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions ({prescriptions?.length || 0})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {patients && patients.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                Patients
              </h3>
              {patients.map((patient) => (
                <Link key={patient.id} href={`/dashboard/patients/${patient.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {patient.first_name} {patient.last_name}
                          </CardTitle>
                          <CardDescription>
                            {patient.patient_number} • {patient.phone}
                          </CardDescription>
                        </div>
                        <Badge>{patient.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {appointments && appointments.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Appointments
              </h3>
              {appointments.map((apt) => (
                <Link key={apt.id} href={`/dashboard/appointments/${apt.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {apt.patient?.first_name} {apt.patient?.last_name}
                          </CardTitle>
                          <CardDescription>
                            {new Date(apt.appointment_date).toLocaleDateString()} at {apt.appointment_time}
                          </CardDescription>
                        </div>
                        <Badge>{apt.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {prescriptions && prescriptions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Prescriptions
              </h3>
              {prescriptions.map((rx) => (
                <Link key={rx.id} href={`/dashboard/prescriptions/${rx.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{rx.prescription_number}</CardTitle>
                          <CardDescription>
                            {rx.patient?.first_name} {rx.patient?.last_name}
                          </CardDescription>
                        </div>
                        <Badge>{rx.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {totalResults === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No results found for “{query}”</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="patients" className="space-y-3">
          {patients && patients.length > 0 ? (
            patients.map((patient) => (
              <Link key={patient.id} href={`/dashboard/patients/${patient.id}`}>
                <Card className="hover:border-primary transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {patient.first_name} {patient.last_name}
                        </CardTitle>
                        <CardDescription>
                          {patient.patient_number} • {patient.phone}
                        </CardDescription>
                      </div>
                      <Badge>{patient.status}</Badge>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No patients found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="appointments">
          {appointments && appointments.length > 0 ? (
            <div className="space-y-3">
              {appointments.map((apt) => (
                <Link key={apt.id} href={`/dashboard/appointments/${apt.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {apt.patient?.first_name} {apt.patient?.last_name}
                          </CardTitle>
                          <CardDescription>
                            {new Date(apt.appointment_date).toLocaleDateString()} at {apt.appointment_time}
                          </CardDescription>
                        </div>
                        <Badge>{apt.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No appointments found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="prescriptions">
          {prescriptions && prescriptions.length > 0 ? (
            <div className="space-y-3">
              {prescriptions.map((rx) => (
                <Link key={rx.id} href={`/dashboard/prescriptions/${rx.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{rx.prescription_number}</CardTitle>
                          <CardDescription>
                            {rx.patient?.first_name} {rx.patient?.last_name}
                          </CardDescription>
                        </div>
                        <Badge>{rx.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No prescriptions found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="invoices">
          {invoices && invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <Link key={invoice.id} href={`/dashboard/billing/${invoice.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{invoice.invoice_number}</CardTitle>
                          <CardDescription>
                            {invoice.patient?.first_name} {invoice.patient?.last_name}
                          </CardDescription>
                        </div>
                        <Badge>{invoice.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No invoices found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
