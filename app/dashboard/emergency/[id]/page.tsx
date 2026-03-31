import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, ArrowLeft, Calendar, Clock, User } from "lucide-react"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

const triageLevels = {
  red: { label: "Critical", color: "bg-red-600", textColor: "text-red-600" },
  orange: { label: "Emergency", color: "bg-orange-600", textColor: "text-orange-600" },
  yellow: { label: "Urgent", color: "bg-yellow-600", textColor: "text-yellow-600" },
  green: { label: "Minor", color: "bg-green-600", textColor: "text-green-600" },
  blue: { label: "Non-Urgent", color: "bg-blue-600", textColor: "text-blue-600" },
} as const

const statusLabels: Record<string, string> = {
  pending: "Pending",
  in_treatment: "In treatment",
  admitted: "Admitted",
  discharged: "Discharged",
  transferred: "Transferred",
}

interface TriageAuditRow {
  id: string
  created_at: string
  action: string
  old_status: string | null
  new_status: string | null
  actor_user_id: string
}

export default async function EmergencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await params
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "emergency.manage")) {
    redirect("/dashboard")
  }

  const [{ data: triage, error }, { data: auditRows }] = await Promise.all([
    supabase
      .from("triage_assessments")
      .select(
        `*,
        patient:patients(full_name, patient_number, date_of_birth, phone_number)
      `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("triage_audit_logs")
      .select("id, created_at, action, old_status, new_status, actor_user_id")
      .eq("triage_id", id)
      .order("created_at", { ascending: false }),
  ])

  if (error) {
    console.error("[v0] Error loading triage detail:", error.message || error)
  }

  if (!triage) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/emergency">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Emergency
              </Link>
            </Button>
            <div>
              <h1 className="text-balance text-3xl font-bold tracking-tight">Emergency case not found</h1>
              <p className="text-pretty text-muted-foreground">
                We couldn&apos;t find details for this emergency case. It may have been closed or the link is invalid.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const level = triageLevels[triage.triage_level as keyof typeof triageLevels]
  const statusLabel = statusLabels[triage.status as string] ?? triage.status

  const arrivalTime = triage.arrival_time ? new Date(triage.arrival_time) : null
  const now = new Date()
  const waitMinutes = arrivalTime
    ? Math.floor((now.getTime() - arrivalTime.getTime()) / (1000 * 60))
    : null

  const rows = (auditRows || []) as TriageAuditRow[]
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean))) as string[]

  const actorProfilesById = new Map<string, { full_name: string | null; role: string | null }>()

  if (actorIds.length > 0) {
    const { data: actorProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", actorIds)

    for (const p of actorProfiles || []) {
      actorProfilesById.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        role: (p.role as string | null) ?? null,
      })
    }
  }

  const formatDateTime = (value: string) => {
    try {
      return new Date(value).toLocaleString()
    } catch {
      return value
    }
  }

  const renderActor = (actorId: string) => {
    const actor = actorProfilesById.get(actorId)
    if (!actor) return actorId
    if (actor.role) {
      return `${actor.full_name ?? "Unknown"} (${actor.role})`
    }
    return actor.full_name ?? actorId
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/emergency">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Emergency
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Emergency case</h1>
            <p className="text-pretty text-muted-foreground">
              Triage level {level?.label ?? triage.triage_level} · {statusLabel}
            </p>
          </div>
        </div>
        {level && (
          <Badge className={`${level.color} text-white text-sm px-3 py-1`}>{level.label}</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Patient information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Name</p>
            <p className="text-sm font-semibold">{triage.patient?.full_name ?? "Unknown"}</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Patient number</p>
              <p>{triage.patient?.patient_number ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Phone</p>
              <p>{triage.patient?.phone_number ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Date of birth</p>
              <p>
                {triage.patient?.date_of_birth
                  ? new Date(triage.patient.date_of_birth).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href={`/dashboard/patients/${triage.patient_id}`}>View patient profile</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Arrival & status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Arrived at {arrivalTime ? arrivalTime.toLocaleString() : "Unknown"}
                {waitMinutes != null && ` · ${waitMinutes} min ago`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs font-medium uppercase">Status</span>
              <Badge variant="outline" className="text-xs capitalize">
                {statusLabel}
              </Badge>
            </div>
            {triage.arrival_mode && (
              <div className="text-muted-foreground">
                <p className="text-xs font-medium">Arrival mode</p>
                <p className="text-sm capitalize">{triage.arrival_mode.replace("_", " ")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Chief complaint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{triage.chief_complaint}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assessment notes</CardTitle>
        </CardHeader>
        <CardContent>
          {triage.assessment_notes ? (
            <pre className="whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              {triage.assessment_notes}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No assessment notes recorded.</p>
          )}
        </CardContent>
      </Card>

      {triage.vital_signs && (
        <Card>
          <CardHeader>
            <CardTitle>Vital signs (at triage)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap gap-4">
              {triage.vital_signs.bp && <span>BP: {triage.vital_signs.bp}</span>}
              {triage.vital_signs.heart_rate && <span>HR: {triage.vital_signs.heart_rate}</span>}
              {triage.vital_signs.resp_rate && <span>RR: {triage.vital_signs.resp_rate}</span>}
              {triage.vital_signs.temperature && <span>T: {triage.vital_signs.temperature}°C</span>}
              {triage.vital_signs.spo2 && <span>SpO₂: {triage.vital_signs.spo2}%</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Emergency activity</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity has been recorded for this emergency case yet.</p>
          ) : (
            <div className="space-y-3 text-xs text-muted-foreground">
              {rows.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                      {log.action === "created"
                        ? "Triage created"
                        : log.action === "status_updated"
                          ? "Status updated"
                          : "Notes updated"}
                    </p>
                    {(log.old_status || log.new_status) && (
                      <p>
                        Status: {log.old_status ?? "(none)"} → {log.new_status ?? "(unchanged)"}
                      </p>
                    )}
                    <p>By: {renderActor(log.actor_user_id)}</p>
                  </div>
                  <div className="whitespace-nowrap text-right">{formatDateTime(log.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
