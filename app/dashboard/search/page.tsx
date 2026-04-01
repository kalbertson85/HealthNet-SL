import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Search, User, Calendar, Pill } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const SEARCH_RESULT_LIMIT = 10
const SEARCH_RESULT_WINDOW = SEARCH_RESULT_LIMIT + 1
const MAX_QUERY_LENGTH = 64

type RelatedPatient = {
  first_name?: string | null
  last_name?: string | null
  patient_number?: string | null
}
type PatientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  patient_number: string | null
  phone: string | null
  status: string | null
}
type AppointmentRow = {
  id: string
  appointment_date: string
  appointment_time: string
  status: string | null
  reason: string | null
  patient?: RelatedPatient | RelatedPatient[] | null
}
type PrescriptionRow = {
  id: string
  prescription_number: string | null
  status: string | null
  patient?: RelatedPatient | RelatedPatient[] | null
}
type InvoiceRow = {
  id: string
  invoice_number: string | null
  status: string | null
  patient?: RelatedPatient | RelatedPatient[] | null
}

function normalizeSearchQuery(value: string): string {
  return value
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[^\p{L}\p{N}\s\-_.@+]/gu, " ")
    .replace(/\s+/g, " ")
}

function normalizeRelatedPatient(patient: RelatedPatient | RelatedPatient[] | null | undefined): RelatedPatient | null {
  if (!patient) return null
  return Array.isArray(patient) ? (patient[0] ?? null) : patient
}

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
  const rawQuery = resolvedSearchParams.q || ""
  const query = normalizeSearchQuery(rawQuery)
  const isQueryTooShort = query.length > 0 && query.length < 2

  if (!query || isQueryTooShort) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Global Search</h1>
          <p className="text-muted-foreground">
            {isQueryTooShort ? "Enter at least 2 characters to search records." : "Search across all hospital records"}
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {isQueryTooShort
                ? "Please type at least 2 characters."
                : "Enter a search term to find patients, appointments, prescriptions, and more"}
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
      .select("id, first_name, last_name, patient_number, phone, status")
      .or(
        `first_name.ilike.%${query}%,last_name.ilike.%${query}%,patient_number.ilike.%${query}%,phone.ilike.%${query}%`,
      )
      .limit(SEARCH_RESULT_WINDOW),
    supabase
      .from("appointments")
      .select("id, appointment_date, appointment_time, status, reason, patient:patients(first_name, last_name, patient_number)")
      .or(`reason.ilike.%${query}%`)
      .limit(SEARCH_RESULT_WINDOW),
    supabase
      .from("prescriptions")
      .select("id, prescription_number, status, patient:patients(first_name, last_name, patient_number)")
      .ilike("prescription_number", `%${query}%`)
      .limit(SEARCH_RESULT_WINDOW),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, patient:patients(first_name, last_name, patient_number)")
      .ilike("invoice_number", `%${query}%`)
      .limit(SEARCH_RESULT_WINDOW),
  ])

  const patientsSlice = ((patients || []) as PatientRow[]).slice(0, SEARCH_RESULT_LIMIT)
  const appointmentsSlice = ((appointments || []) as AppointmentRow[]).slice(0, SEARCH_RESULT_LIMIT)
  const prescriptionsSlice = ((prescriptions || []) as PrescriptionRow[]).slice(0, SEARCH_RESULT_LIMIT)
  const invoicesSlice = ((invoices || []) as InvoiceRow[]).slice(0, SEARCH_RESULT_LIMIT)
  const resultsCapped =
    (patients?.length || 0) > SEARCH_RESULT_LIMIT ||
    (appointments?.length || 0) > SEARCH_RESULT_LIMIT ||
    (prescriptions?.length || 0) > SEARCH_RESULT_LIMIT ||
    (invoices?.length || 0) > SEARCH_RESULT_LIMIT

  const totalResults =
    patientsSlice.length + appointmentsSlice.length + prescriptionsSlice.length + invoicesSlice.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Search Results</h1>
        <p className="text-muted-foreground">
          Found {totalResults} results for “{query}”
        </p>
        {resultsCapped ? (
          <p className="text-xs text-amber-700">Results are capped at {SEARCH_RESULT_LIMIT} per section for performance.</p>
        ) : null}
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
          {patientsSlice.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5" />
                Patients
              </h3>
              {patientsSlice.map((patient) => (
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

          {appointmentsSlice.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Appointments
              </h3>
              {appointmentsSlice.map((apt) => (
                (() => {
                  const patient = normalizeRelatedPatient(apt.patient)
                  return (
                <Link key={apt.id} href={`/dashboard/appointments/${apt.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {patient?.first_name} {patient?.last_name}
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
                  )
                })()
              ))}
            </div>
          )}

          {prescriptionsSlice.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Prescriptions
              </h3>
              {prescriptionsSlice.map((rx) => (
                (() => {
                  const patient = normalizeRelatedPatient(rx.patient)
                  return (
                <Link key={rx.id} href={`/dashboard/prescriptions/${rx.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{rx.prescription_number}</CardTitle>
                          <CardDescription>
                            {patient?.first_name} {patient?.last_name}
                          </CardDescription>
                        </div>
                        <Badge>{rx.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
                  )
                })()
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
          {patientsSlice.length > 0 ? (
            patientsSlice.map((patient) => (
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
          {appointmentsSlice.length > 0 ? (
            <div className="space-y-3">
              {appointmentsSlice.map((apt) => (
                (() => {
                  const patient = normalizeRelatedPatient(apt.patient)
                  return (
                <Link key={apt.id} href={`/dashboard/appointments/${apt.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {patient?.first_name} {patient?.last_name}
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
                  )
                })()
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
          {prescriptionsSlice.length > 0 ? (
            <div className="space-y-3">
              {prescriptionsSlice.map((rx) => (
                (() => {
                  const patient = normalizeRelatedPatient(rx.patient)
                  return (
                <Link key={rx.id} href={`/dashboard/prescriptions/${rx.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{rx.prescription_number}</CardTitle>
                          <CardDescription>
                            {patient?.first_name} {patient?.last_name}
                          </CardDescription>
                        </div>
                        <Badge>{rx.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
                  )
                })()
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
          {invoicesSlice.length > 0 ? (
            <div className="space-y-3">
              {invoicesSlice.map((invoice) => (
                (() => {
                  const patient = normalizeRelatedPatient(invoice.patient)
                  return (
                <Link key={invoice.id} href={`/dashboard/billing/${invoice.id}`}>
                  <Card className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{invoice.invoice_number}</CardTitle>
                          <CardDescription>
                            {patient?.first_name} {patient?.last_name}
                          </CardDescription>
                        </div>
                        <Badge>{invoice.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
                  )
                })()
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
