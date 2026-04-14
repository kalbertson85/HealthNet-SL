import { createServerClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ClipboardPlus, FileText, Pill, TestTube, UserRound, BedDouble } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { fetchRecordsVisitHandoff } from "@/lib/records/queries"
import { PatientWorkflowPanel } from "@/components/patient-workflow-panel"
import { buildFollowUpAppointmentHref } from "@/lib/patient-flow"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatDateTime } from "@/lib/locale-format"

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

function formatAge(dob?: string | null) {
  if (!dob) return "-"
  try {
    const birth = new Date(dob)
    const years = Math.floor((Date.now() - birth.getTime()) / 31557600000)
    return `${years}y`
  } catch {
    return "-"
  }
}

function getVisitHandoffConfig(
  visitStatus: string,
  visitId: string,
  admissionId: string | null,
  patientId: string | null,
) {
  switch (visitStatus) {
    case "doctor_pending":
      return {
        title: "Doctor review is the next step",
        description: "Registration is complete. Hand the patient to the doctor workspace for assessment and treatment planning.",
        href: "/dashboard/doctor",
        label: "Open doctor workspace",
        icon: <UserRound className="h-4 w-4" />,
      }
    case "doctor_review":
      return {
        title: "Doctor follow-up is pending",
        description: "This visit is waiting for the doctor to review results or continue the encounter.",
        href: "/dashboard/doctor",
        label: "Return to doctor workspace",
        icon: <UserRound className="h-4 w-4" />,
      }
    case "lab_pending":
      return {
        title: "Investigation workflow is active",
        description: "This visit is waiting on lab or imaging results before it can return for clinical review.",
        href: "/dashboard/investigations",
        label: "Open investigations",
        icon: <TestTube className="h-4 w-4" />,
      }
    case "billing_pending":
      return {
        title: "Billing is the next step",
        description: "This visit is ready for invoice generation or payment follow-up.",
        href: `/dashboard/billing/visit/${visitId}`,
        label: "Open billing for this visit",
        icon: <FileText className="h-4 w-4" />,
      }
    case "pharmacy_pending":
      return {
        title: "Pharmacy dispensing is pending",
        description: "The clinical and billing steps are complete. The patient should be handed to pharmacy for dispensing.",
        href: "/dashboard/pharmacy",
        label: "Open pharmacy workspace",
        icon: <Pill className="h-4 w-4" />,
      }
    case "admitted":
      return {
        title: "Patient is admitted",
        description: "This visit has already moved into inpatient care. Continue with admission or ward management instead of doctor intake.",
        href: admissionId ? `/dashboard/inpatient/${admissionId}` : "/dashboard/inpatient",
        label: admissionId ? "Open admission" : "Open inpatient workspace",
        icon: <BedDouble className="h-4 w-4" />,
      }
    case "completed":
      return {
        title: "Visit is completed",
        description: "This visit has finished. Use the patient record for follow-up, printing, or a future visit.",
        href: patientId ? `/dashboard/patients/${patientId}` : "/dashboard/patients",
        label: patientId ? "Open patient record" : "Open patient records",
        icon: <ClipboardPlus className="h-4 w-4" />,
      }
    default:
      return {
        title: "Next step needs review",
        description: "This visit has a status that does not map cleanly to one workflow. Open the patient record and confirm the next action.",
        href: patientId ? `/dashboard/patients/${patientId}` : "/dashboard/patients",
        label: patientId ? "Open patient record" : "Open patient records",
        icon: <ClipboardPlus className="h-4 w-4" />,
      }
  }
}

export const revalidate = 0

export default async function RecordsVisitHandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()
  const settings = await getGlobalSettings()

  if (!user) {
    redirect("/auth/login")
  }

  const { id } = await params
  const { visit, admissionId } = await fetchRecordsVisitHandoff(supabase, id)
  if (!visit) {
    notFound()
  }

  const patient = normalizeSingle(visit.patients)
  const facility = normalizeSingle(visit.facilities)
  const handoff = getVisitHandoffConfig(visit.visit_status, visit.id, admissionId, patient?.id ?? null)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight">Visit handoff</h1>
          <p className="text-pretty text-muted-foreground">
            Registration is complete. Use this page to confirm the visit stage and hand the patient to the correct team.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/records">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Records
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Visit summary</CardTitle>
            <CardDescription>Current state of the visit created or resumed from records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Patient</p>
                <p className="font-medium">{patient?.full_name || "Unknown patient"}</p>
                <p className="text-muted-foreground">
                  {patient?.patient_number || "-"} · Age {formatAge(patient?.date_of_birth)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Visit status</p>
                <div className="mt-1">
                  <Badge variant="outline">{visit.visit_status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">Created {formatDateTime(visit.created_at, settings)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Payer category</p>
                <p>{visit.payer_category || "unknown"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Facility</p>
                <p>
                  {facility?.name || "Unassigned"}
                  {facility?.code ? ` (${facility.code})` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{settings.publicCoverageLabel}</p>
                <p>{visit.is_free_health_care ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Diagnosis</p>
                <p>{visit.diagnosis || "Not yet recorded"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              {handoff.icon}
              <span className="text-sm font-medium">Next step</span>
            </div>
            <CardTitle>{handoff.title}</CardTitle>
            <CardDescription className="text-sm text-slate-700">{handoff.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Records staff should confirm the patient identity and then use the next workspace below. This page avoids
              sending registration users directly into a clinician-only workflow without context.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={handoff.href}>
                  {handoff.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              {patient?.id ? (
                <Button asChild variant="outline">
                  <Link href={`/dashboard/patients/${patient.id}`}>Open patient record</Link>
                </Button>
              ) : null}

              {patient?.id ? (
                <Button asChild variant="outline">
                  <Link href={`/dashboard/records/patient-card/${patient.id}`}>Print patient card</Link>
                </Button>
              ) : null}

              {visit.visit_status === "completed" && patient?.id ? (
                <Button asChild variant="outline">
                  <Link
                    href={buildFollowUpAppointmentHref({
                      patientId: patient.id,
                      source: "follow_up",
                      reason: "Post-visit follow-up",
                      visitId: visit.id,
                    })}
                  >
                    Book follow-up
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <PatientWorkflowPanel
        currentStage={
          visit.visit_status === "billing_pending"
            ? "billing"
            : visit.visit_status === "pharmacy_pending"
              ? "pharmacy"
              : visit.visit_status === "lab_pending"
                ? "diagnostics"
                : "queue"
        }
        patientId={patient?.id ?? null}
        visitId={visit.id}
        title="Encounter continuity"
        description="Use the linked visit as the backbone of the patient journey so staff do not lose context between modules."
      />
    </div>
  )
}
