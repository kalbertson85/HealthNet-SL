import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PATIENT_FLOW_MODULES, type PatientFlowStage, getPatientFlowActions } from "@/lib/patient-flow"

export function PatientWorkflowPanel({
  currentStage,
  visitId,
  patientId,
  admissionId,
  title = "Patient flow",
  description = "Use the current stage and next steps to keep the patient journey continuous.",
}: {
  currentStage: PatientFlowStage
  visitId?: string | null
  patientId?: string | null
  admissionId?: string | null
  title?: string
  description?: string
}) {
  const stageModules = PATIENT_FLOW_MODULES.filter((module) => module.stage === currentStage)
  const nextActions = getPatientFlowActions(currentStage, visitId, patientId, admissionId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current workflow stage</p>
          <div className="grid gap-2 md:grid-cols-2">
            {stageModules.map((module) => (
              <div key={module.href} className="rounded-md border bg-muted/20 px-3 py-3 text-sm">
                <p className="font-medium">{module.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
              </div>
            ))}
          </div>
        </div>

        {nextActions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended next steps</p>
            <div className="grid gap-2 md:grid-cols-2">
              {nextActions.map((action) => (
                <div key={action.href} className="rounded-md border px-3 py-3 text-sm">
                  <p className="font-medium">{action.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href={action.href}>{action.label}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
