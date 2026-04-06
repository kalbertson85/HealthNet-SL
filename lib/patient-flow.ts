export type PatientFlowStage =
  | "registration"
  | "triage"
  | "queue"
  | "doctor"
  | "diagnostics"
  | "prescriptions"
  | "pharmacy"
  | "billing"
  | "extended-care"
  | "discharge"
  | "follow-up"

export interface PatientFlowModule {
  label: string
  href: string
  stage: PatientFlowStage
  description: string
}

export const PATIENT_FLOW_MODULES: PatientFlowModule[] = [
  {
    label: "Patients",
    href: "/dashboard/patients",
    stage: "registration",
    description: "Patient registration, demographics, insurance, and chart identity.",
  },
  {
    label: "Triage",
    href: "/dashboard/triage",
    stage: "triage",
    description: "Vitals, acuity, and initial clinical priority before clinician review.",
  },
  {
    label: "Appointments",
    href: "/dashboard/appointments",
    stage: "queue",
    description: "Scheduled arrivals and follow-up bookings that feed the waiting workflow.",
  },
  {
    label: "Queue",
    href: "/dashboard/queue",
    stage: "queue",
    description: "Live waiting-room handoff across OPD, emergency, diagnostics, pharmacy, and billing.",
  },
  {
    label: "Doctor",
    href: "/dashboard/doctor",
    stage: "doctor",
    description: "Consultation, diagnosis, treatment planning, and next-step routing.",
  },
  {
    label: "Lab Tests",
    href: "/dashboard/lab",
    stage: "diagnostics",
    description: "Laboratory orders, results, and return-to-doctor review.",
  },
  {
    label: "Radiology",
    href: "/dashboard/radiology",
    stage: "diagnostics",
    description: "Imaging requests, results, and return-to-doctor review.",
  },
  {
    label: "Prescriptions",
    href: "/dashboard/prescriptions",
    stage: "prescriptions",
    description: "Medication orders produced during consultation and review.",
  },
  {
    label: "Pharmacy",
    href: "/dashboard/pharmacy",
    stage: "pharmacy",
    description: "Dispensing against prescriptions and stock-controlled medication release.",
  },
  {
    label: "Billing",
    href: "/dashboard/billing",
    stage: "billing",
    description: "Visit charge aggregation, payment capture, and insurer billing.",
  },
  {
    label: "Inpatient",
    href: "/dashboard/inpatient",
    stage: "extended-care",
    description: "Admission, ward management, inpatient treatment, and discharge.",
  },
  {
    label: "Surgery",
    href: "/dashboard/surgery",
    stage: "extended-care",
    description: "Operative care linked to admissions and post-op follow-through.",
  },
  {
    label: "Nursing",
    href: "/dashboard/nursing",
    stage: "extended-care",
    description: "Ward notes, bedside care, and inpatient operational follow-through.",
  },
  {
    label: "Emergency",
    href: "/dashboard/emergency",
    stage: "triage",
    description: "Fast-track entry into the same visit workflow for urgent and critical patients.",
  },
]

export interface PatientFlowAction {
  label: string
  href: string
  description: string
}

export function buildFollowUpAppointmentHref({
  patientId,
  source,
  reason,
  visitId,
  admissionId,
  notes,
}: {
  patientId?: string | null
  source?: string | null
  reason?: string | null
  visitId?: string | null
  admissionId?: string | null
  notes?: string | null
}): string {
  const params = new URLSearchParams()
  if (patientId) params.set("patient_id", patientId)
  if (source) params.set("source", source)
  if (reason) params.set("reason", reason)
  if (visitId) params.set("visit_id", visitId)
  if (admissionId) params.set("admission_id", admissionId)
  if (notes) params.set("notes", notes)
  const query = params.toString()
  return query ? `/dashboard/appointments/new?${query}` : "/dashboard/appointments/new"
}

export function getPatientFlowActions(
  stage: PatientFlowStage,
  visitId?: string | null,
  patientId?: string | null,
  admissionId?: string | null,
): PatientFlowAction[] {
  switch (stage) {
    case "registration":
      return [
        {
          label: "Send to triage",
          href: "/dashboard/triage",
          description: "Capture vitals and assign acuity before the patient enters the active queue.",
        },
        {
          label: "Book appointment",
          href: buildFollowUpAppointmentHref({ patientId }),
          description: "Use appointments for scheduled visits or follow-up care.",
        },
      ]
    case "triage":
      return [
        {
          label: "Open OPD queue",
          href: "/dashboard/queue/opd",
          description: "Move triaged patients into the waiting workflow for clinician review.",
        },
        {
          label: "Open emergency board",
          href: "/dashboard/emergency",
          description: "Use emergency when the patient must bypass normal waiting flow.",
        },
      ]
    case "queue":
      return [
        {
          label: "Open doctor workspace",
          href: "/dashboard/doctor",
          description: "Continue the visit from queue into consultation and diagnosis.",
        },
        {
          label: "Review active visit",
          href: visitId ? `/dashboard/records/visit/${visitId}` : "/dashboard/records",
          description: "Confirm the active encounter before handing the patient to the next team.",
        },
      ]
    case "doctor":
      return [
        {
          label: "Order diagnostics",
          href: "/dashboard/investigations",
          description: "Send the patient to lab or radiology and route results back for review.",
        },
        {
          label: "Prepare billing",
          href: visitId ? `/dashboard/billing/visit/${visitId}` : "/dashboard/billing",
          description: "Send completed clinical work to billing when no further diagnostics are needed.",
        },
      ]
    case "diagnostics":
      return [
        {
          label: "Return to doctor",
          href: "/dashboard/doctor",
          description: "Doctor review confirms the result and next treatment step.",
        },
      ]
    case "prescriptions":
      return [
        {
          label: "Open pharmacy",
          href: "/dashboard/pharmacy",
          description: "Dispense against the prescription and update visit completion.",
        },
      ]
    case "pharmacy":
      return [
        {
          label: "Review billing",
          href: visitId ? `/dashboard/billing/visit/${visitId}` : "/dashboard/billing",
          description: "Confirm all services have been charged before final closure.",
        },
        {
          label: "Book follow-up",
          href: buildFollowUpAppointmentHref({
            patientId,
            source: "pharmacy",
            reason: "Medication follow-up",
            visitId,
          }),
          description: "Create the next planned encounter for ongoing care.",
        },
      ]
    case "billing":
      return [
        {
          label: "Admit patient",
          href: visitId ? `/dashboard/inpatient/new?visit_id=${visitId}` : "/dashboard/inpatient/new",
          description: "Continue into inpatient care when the patient needs extended treatment.",
        },
        {
          label: "Book follow-up",
          href: buildFollowUpAppointmentHref({
            patientId,
            source: "billing",
            reason: "Post-billing follow-up",
            visitId,
          }),
          description: "Use appointments to capture post-payment follow-up and review visits.",
        },
      ]
    case "extended-care":
      return [
        {
          label: "Complete discharge",
          href: admissionId ? `/dashboard/inpatient/${admissionId}` : "/dashboard/inpatient",
          description: "Document discharge summary and instructions before closing the visit.",
        },
        {
          label: "Book follow-up",
          href: buildFollowUpAppointmentHref({
            patientId,
            source: "extended_care",
            reason: "Post-admission follow-up",
            visitId,
            admissionId,
          }),
          description: "Schedule future review after admission, surgery, or ward treatment.",
        },
      ]
    case "discharge":
    case "follow-up":
      return [
        {
          label: "Book appointment",
          href: buildFollowUpAppointmentHref({
            patientId,
            source: "follow_up",
            reason: "Follow-up review",
            visitId,
            admissionId,
          }),
          description: "Record the next planned review so the care path stays connected.",
        },
        {
          label: "Open patient record",
          href: patientId ? `/dashboard/patients/${patientId}` : "/dashboard/patients",
          description: "Return to the patient chart for records, printouts, and future care.",
        },
      ]
    default:
      return []
  }
}
