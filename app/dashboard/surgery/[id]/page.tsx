import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface SurgeryDetail {
  id: string
  procedure_name: string
  procedure_type: string | null
  status: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  notes: string | null
  patients?: {
    full_name?: string | null
    patient_number?: string | null
    phone_number?: string | null
  } | null
  profiles?: { full_name?: string | null } | null
  visits?: {
    is_free_health_care?: boolean | null
    facilities?: { name?: string | null; code?: string | null } | null
  } | null
}

export default async function SurgeryDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createServerClient()

  const { data } = await supabase
    .from("surgeries")
    .select(
      `*,
       patients(full_name, patient_number, phone_number),
       profiles:surgeon_id(full_name),
       visits(is_free_health_care,
         facilities(name, code)
       )
      `,
    )
    .eq("id", id)
    .maybeSingle()

  if (!data) {
    notFound()
  }

  const surgery = data as SurgeryDetail

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/surgery">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Surgery
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Surgery</h1>
            <p className="text-pretty text-muted-foreground flex flex-wrap items-center gap-2">
              <span>{surgery.procedure_name}</span>
              {surgery.procedure_type && <span className="text-xs text-muted-foreground">({surgery.procedure_type})</span>}
              {surgery.visits?.is_free_health_care && (
                <Badge variant="secondary" className="text-[11px]">
                  Free Health Care
                </Badge>
              )}
              {surgery.visits?.facilities?.name && (
                <span className="text-xs text-muted-foreground">
                  {surgery.visits.facilities.name}
                  {surgery.visits.facilities.code ? ` (${surgery.visits.facilities.code})` : ""}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <Badge variant={surgery.status === "completed" ? "secondary" : "default"}>{surgery.status}</Badge>
          {surgery.scheduled_at && (
            <span className="text-muted-foreground">
              Scheduled: {new Date(surgery.scheduled_at).toLocaleString()}
            </span>
          )}
          {surgery.started_at && (
            <span className="text-muted-foreground">
              Started: {new Date(surgery.started_at).toLocaleString()}
            </span>
          )}
          {surgery.ended_at && (
            <span className="text-muted-foreground">
              Ended: {new Date(surgery.ended_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
            <CardDescription>Patient linked to this procedure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="text-base font-medium">{surgery.patients?.full_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Patient Number</p>
              <p>{surgery.patients?.patient_number || "–"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Phone</p>
              <p>{surgery.patients?.phone_number || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Surgeon & Context</CardTitle>
            <CardDescription>Clinical context of this procedure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Surgeon</p>
              <p>Dr. {surgery.profiles?.full_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Facility</p>
              <p>
                {surgery.visits?.facilities?.name
                  ? `${surgery.visits.facilities.name}${
                      surgery.visits.facilities.code ? ` (${surgery.visits.facilities.code})` : ""
                    }`
                  : "Not recorded"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timing</CardTitle>
          <CardDescription>Schedule and actual operative times.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Scheduled</p>
            <p>{surgery.scheduled_at ? new Date(surgery.scheduled_at).toLocaleString() : "Not scheduled"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Started</p>
            <p>{surgery.started_at ? new Date(surgery.started_at).toLocaleString() : "Not recorded"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Ended</p>
            <p>{surgery.ended_at ? new Date(surgery.ended_at).toLocaleString() : "Not recorded"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Operative notes or key comments.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {surgery.notes && surgery.notes.trim().length > 0 ? surgery.notes : "No notes recorded."}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
