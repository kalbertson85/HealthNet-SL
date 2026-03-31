import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { AlertCircle, Clock, Users, Activity } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

const triageLevels = {
  red: { label: "Critical", color: "bg-red-600", textColor: "text-red-600", priority: 1, reassessMinutes: 10 },
  orange: { label: "Emergency", color: "bg-orange-600", textColor: "text-orange-600", priority: 2, reassessMinutes: 15 },
  yellow: { label: "Urgent", color: "bg-yellow-600", textColor: "text-yellow-600", priority: 3, reassessMinutes: 30 },
  green: { label: "Minor", color: "bg-green-600", textColor: "text-green-600", priority: 4, reassessMinutes: 60 },
  blue: { label: "Non-Urgent", color: "bg-blue-600", textColor: "text-blue-600", priority: 5, reassessMinutes: 120 },
} as const

const statusColors = {
  pending: "bg-yellow-500",
  in_treatment: "bg-blue-500",
  admitted: "bg-purple-500",
  discharged: "bg-green-500",
  transferred: "bg-teal-500",
}

export default async function EmergencyPage() {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "emergency.manage")) {
    redirect("/dashboard")
  }

  // Fetch active triage assessments, including visit FHC/facility context where available
  const { data: triages } = await supabase
    .from("triage_assessments")
    .select(`
      *,
      patient:patients(patient_number, full_name, date_of_birth, phone_number),
      visits:visits(is_free_health_care, facility_id,
        facilities(name, code)
      )
    `)
    .in("status", ["pending", "in_treatment"])
    .order("arrival_time", { ascending: true })

  // Calculate statistics
  const stats = {
    total: triages?.length || 0,
    critical: triages?.filter((t) => t.triage_level === "red").length || 0,
    emergency: triages?.filter((t) => t.triage_level === "orange").length || 0,
    pending: triages?.filter((t) => t.status === "pending").length || 0,
    inTreatment: triages?.filter((t) => t.status === "in_treatment").length || 0,
  }

  // Sort by triage priority
  const sortedTriages = triages?.sort((a, b) => {
    const priorityA = triageLevels[a.triage_level as keyof typeof triageLevels]?.priority || 999
    const priorityB = triageLevels[b.triage_level as keyof typeof triageLevels]?.priority || 999
    return priorityA - priorityB
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Emergency & Triage</h1>
          <p className="text-muted-foreground">
            {stats.total} active case{stats.total === 1 ? "" : "s"}
            {stats.critical > 0 && ` • ${stats.critical} critical`}
          </p>
        </div>
        <Link href="/dashboard/emergency/new">
          <Button size="lg" className="bg-red-600 hover:bg-red-700">
            <AlertCircle className="mr-2 h-5 w-5" />
            New Emergency
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Treatment</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inTreatment}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Triage Cases</CardTitle>
          <CardDescription>
            Sorted by priority level - critical cases first. Shows time since arrival and recommended reassessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedTriages && sortedTriages.length > 0 ? (
              sortedTriages.map((triage) => {
                const level = triageLevels[triage.triage_level as keyof typeof triageLevels]
                const waitTime = Math.floor(
                  (new Date().getTime() - new Date(triage.arrival_time).getTime()) / (1000 * 60),
                )
                const reassessTarget = level?.reassessMinutes
                const reassessDelta = reassessTarget != null ? reassessTarget - waitTime : null

                const ambulanceLine = (triage.assessment_notes as string | null | undefined)
                  ?.split("\n")
                  .find((line) => line.trim().startsWith("AMBULANCE:"))

                return (
                  <Link key={triage.id} href={`/dashboard/emergency/${triage.id}`}>
                    <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                      <div className={`w-3 h-16 rounded ${level.color}`} />

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{triage.patient?.full_name}</p>
                          <Badge variant="outline" className="text-xs">
                            {triage.patient?.patient_number}
                          </Badge>
                          <Badge className={level.color}>{level.label}</Badge>
                        </div>

                        <p className="text-sm text-muted-foreground mb-1">{triage.chief_complaint}</p>

                        {ambulanceLine && (
                          <p className="text-xs text-red-700 mb-1">
                            <span className="font-semibold">Ambulance handover:</span> {ambulanceLine.replace("AMBULANCE:", "").trim()}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>Arrived: {waitTime} min ago</span>
                          {reassessDelta != null && (
                            <>
                              <span>•</span>
                              {reassessDelta <= 0 ? (
                                <span className="font-semibold text-red-600">Reassess now</span>
                              ) : (
                                <span>
                                  Reassess in {reassessDelta} min (target {reassessTarget} min)
                                </span>
                              )}
                            </>
                          )}
                          {triage.arrival_mode && (
                            <>
                              <span>•</span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] capitalize ${
                                  triage.arrival_mode === "ambulance"
                                    ? "border-red-500 text-red-600 bg-red-50"
                                    : "border-muted text-muted-foreground"
                                }`}
                              >
                                {triage.arrival_mode === "ambulance" ? "Ambulance arrival" : triage.arrival_mode.replace("_", " ")}
                              </span>
                            </>
                          )}
                          {triage.vital_signs && (
                            <>
                              <span>•</span>
                              <span>BP: {triage.vital_signs.bp || "N/A"}</span>
                              <span>•</span>
                              <span>HR: {triage.vital_signs.heart_rate || "N/A"}</span>
                            </>
                          )}
                          {triage.visits?.facilities?.name && (
                            <>
                              <span>•</span>
                              <span>
                                {triage.visits.facilities.name}
                                {triage.visits.facilities.code
                                  ? ` (${triage.visits.facilities.code})`
                                  : ""}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Badge className={statusColors[triage.status as keyof typeof statusColors]}>
                          {triage.status.replace("_", " ")}
                        </Badge>
                        {triage.visits?.is_free_health_care && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Free Health Care visit
                          </Badge>
                        )}
                        {waitTime > 60 && (
                          <Badge variant="outline" className="text-xs text-red-600">
                            {Math.floor(waitTime / 60)}h {waitTime % 60}m wait
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p>No active emergency cases</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
