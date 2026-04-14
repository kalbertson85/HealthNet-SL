import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createServerClient } from "@/lib/supabase/server"
import { getGlobalSettings } from "@/lib/global-settings"
import { createTranslator } from "@/lib/i18n"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import { fetchDashboardRecentActivityCached } from "@/lib/dashboard/queries"

export async function DashboardRecentActivitySection({
  todayIsoDate,
  canViewPatients,
  canManageAppointments,
}: {
  todayIsoDate: string
  canViewPatients: boolean
  canManageAppointments: boolean
}) {
  const sectionPerf = startPageRenderTimer("dashboard.home.recent_activity", { slowThresholdMs: 1200 })
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const t = createTranslator(settings.language)

  try {
    const { recentPatients, todayAppointments } = await fetchDashboardRecentActivityCached(
      supabase,
      todayIsoDate,
      canViewPatients,
      canManageAppointments,
    )

    sectionPerf.done({
      query_count: Number(canViewPatients) + Number(canManageAppointments),
      recent_patients: recentPatients.length,
      today_appointments: todayAppointments.length,
    })

    if (!canViewPatients && !canManageAppointments) {
      return null
    }

    return (
      <div className="order-1 md:order-2 grid gap-4 md:grid-cols-2">
        {canViewPatients ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.recentPatientsTitle", "Recent Patients")}</CardTitle>
              <CardDescription>{t("dashboard.recentPatientsDescription", "Newly registered patients")}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentPatients.length > 0 ? (
                <div className="space-y-4">
                  {recentPatients.map((patient) => (
                    <div key={patient.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{patient.full_name}</p>
                        <p className="text-sm text-muted-foreground">{patient.patient_number}</p>
                      </div>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/dashboard/patients/${patient.id}`}>{t("common.view", "View")}</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("dashboard.recentPatientsEmpty", "No recent patients")}</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canManageAppointments ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.todayAppointmentsTitle", "Today’s Appointments")}</CardTitle>
              <CardDescription>{t("dashboard.todayAppointmentsDescription", "Upcoming appointments")}</CardDescription>
            </CardHeader>
            <CardContent>
              {todayAppointments.length > 0 ? (
                <div className="space-y-4">
                  {todayAppointments.map((appointment) => {
                    const patient = Array.isArray(appointment.patients) ? appointment.patients[0] : appointment.patients
                    const doctor = Array.isArray(appointment.profiles) ? appointment.profiles[0] : appointment.profiles
                    return (
                      <div key={appointment.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{patient?.full_name || t("common.unknown", "Unknown")}</p>
                          <p className="text-sm text-muted-foreground">
                            {appointment.appointment_time} - {t("dashboard.appointmentDoctorPrefix", "Dr.")} {doctor?.full_name || t("common.unassigned", "Unassigned")}
                          </p>
                        </div>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/appointments/${appointment.id}`}>{t("common.view", "View")}</Link>
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("dashboard.todayAppointmentsEmpty", "No appointments today")}</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    )
  } catch (error) {
    sectionPerf.fail(error, { query_count: Number(canViewPatients) + Number(canManageAppointments) })
    throw error
  }
}
