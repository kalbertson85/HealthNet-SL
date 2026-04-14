import Link from "next/link"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardOnboarding } from "@/components/dashboard-onboarding"
import { DashboardPageShell } from "@/components/dashboard-page-shell"
import { DraftResumePanel } from "@/components/draft-resume-panel"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { getGlobalSettings } from "@/lib/global-settings"
import { createTranslator } from "@/lib/i18n"
import { startPageRenderTimer } from "@/lib/observability/page-performance"
import { can, type PermissionKey } from "@/lib/utils"
import type { DashboardRbacUser } from "@/lib/dashboard/queries"
import { DashboardMetricsSection } from "@/app/dashboard/_components/dashboard-metrics-section"
import { DashboardAlertsSection } from "@/app/dashboard/_components/dashboard-alerts-section"
import { DashboardTrendsSection } from "@/app/dashboard/_components/dashboard-trends-section"
import { DashboardRecentActivitySection } from "@/app/dashboard/_components/dashboard-recent-activity-section"
import { DashboardRoleFocusSection } from "@/app/dashboard/_components/dashboard-role-focus-section"
import {
  AlertsFallback,
  MetricsFallback,
  RecentActivityFallback,
  TrendsFallback,
} from "@/app/dashboard/_components/dashboard-section-fallbacks"

interface QuickActionItem {
  label: string
  href: string
  permission?: PermissionKey
}

const QUICK_ACTIONS: QuickActionItem[] = [
  { label: "Register Patient", href: "/dashboard/patients/new", permission: "patients.create" },
  { label: "Book Appointment", href: "/dashboard/appointments/new", permission: "appointments.manage" },
  { label: "Create Prescription", href: "/dashboard/prescriptions/new", permission: "prescriptions.manage" },
  { label: "Create Invoice", href: "/dashboard/billing/new", permission: "billing.manage" },
  { label: "Open Reports", href: "/dashboard/reports", permission: "reports.view" },
  { label: "Company Insurance", href: "/dashboard/reports/company-insurance", permission: "reports.view" },
]

const ROLE_QUICK_ACTIONS: Partial<Record<string, QuickActionItem[]>> = {
  doctor: [
    { label: "Open Doctor Workspace", href: "/dashboard/doctor" },
    { label: "Review Lab Queue", href: "/dashboard/lab?status=pending", permission: "lab.manage" },
  ],
  nurse: [
    { label: "Open Nursing Workspace", href: "/dashboard/nursing", permission: "inpatient.manage" },
    { label: "Open Inpatient List", href: "/dashboard/inpatient", permission: "inpatient.manage" },
  ],
  nursing: [
    { label: "Open Nursing Workspace", href: "/dashboard/nursing", permission: "inpatient.manage" },
    { label: "Open Inpatient List", href: "/dashboard/inpatient", permission: "inpatient.manage" },
  ],
  pharmacist: [
    { label: "Open Dispensing Queue", href: "/dashboard/prescriptions", permission: "prescriptions.manage" },
    { label: "Review Stock", href: "/dashboard/pharmacy?stock_filter=low", permission: "pharmacy.manage" },
  ],
  admin: [
    { label: "Open Reports", href: "/dashboard/reports", permission: "reports.view" },
    { label: "Insurance Batches", href: "/dashboard/billing/insurance", permission: "billing.manage" },
  ],
  facility_admin: [
    { label: "Open Reports", href: "/dashboard/reports", permission: "reports.view" },
    { label: "Insurance Batches", href: "/dashboard/billing/insurance", permission: "billing.manage" },
  ],
}

export default async function DashboardPage() {
  const pagePerf = startPageRenderTimer("dashboard.home", { slowThresholdMs: 3000 })

  try {
    const [{ user, profile }, settings] = await Promise.all([getSessionUserAndProfile(), getGlobalSettings()])

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser: DashboardRbacUser = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null,
    }
    const canViewPatients = can(rbacUser, "patients.view")
    const canManageAppointments = can(rbacUser, "appointments.manage")
    const canViewRevenue = can(rbacUser, "billing.manage") || can(rbacUser, "reports.view")
    const todayIsoDate = new Date().toISOString().split("T")[0]
    const t = createTranslator(settings.language)
    const roleQuickActions = ROLE_QUICK_ACTIONS[(rbacUser.role || "").toLowerCase()] || []
    const availableQuickActions = [...roleQuickActions, ...QUICK_ACTIONS].filter((item, index, items) => {
      if (item.permission && !can(rbacUser, item.permission)) return false
      return items.findIndex((candidate) => candidate.href === item.href) === index
    })

    pagePerf.done({
      query_count: 0,
      streamed_sections: 4,
      cached_sections: 3,
      can_view_patients: canViewPatients,
      can_manage_appointments: canManageAppointments,
    })

    return (
      <DashboardPageShell
        title={t("dashboard.title", "Dashboard")}
        description={t("dashboard.description", "High-level overview of patients, appointments, billing, and clinical activity.")}
      >
        <DashboardOnboarding role={rbacUser.role} />
        <DraftResumePanel settings={settings} />

        <Suspense fallback={null}>
          <DashboardRoleFocusSection rbacUser={rbacUser} />
        </Suspense>

        <Suspense fallback={<MetricsFallback />}>
          <DashboardMetricsSection rbacUser={rbacUser} todayIsoDate={todayIsoDate} />
        </Suspense>

        <Suspense fallback={<AlertsFallback />}>
          <DashboardAlertsSection rbacUser={rbacUser} />
        </Suspense>

        <Suspense fallback={<TrendsFallback showRevenueTrend={canViewRevenue} />}>
          <DashboardTrendsSection rbacUser={rbacUser} todayIsoDate={todayIsoDate} />
        </Suspense>

        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className="order-2 md:order-1">
            <CardHeader>
              <CardTitle>{t("dashboard.quickActionsTitle", "Quick Actions")}</CardTitle>
              <CardDescription>{t("dashboard.quickActionsDescription", "Actions available for your role")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {availableQuickActions.map((item) => (
                <Button key={item.href} asChild variant="outline">
                  <Link href={item.href}>
                    {item.label === "Register Patient"
                      ? t("dashboard.actionRegisterPatient", item.label)
                      : item.label === "Book Appointment"
                        ? t("dashboard.actionBookAppointment", item.label)
                        : item.label === "Create Prescription"
                          ? t("dashboard.actionCreatePrescription", item.label)
                          : item.label === "Create Invoice"
                            ? t("dashboard.actionCreateInvoice", item.label)
                            : item.label === "Open Reports"
                              ? t("dashboard.actionOpenReports", item.label)
                              : item.label === "Company Insurance"
                                ? t("dashboard.actionCompanyInsurance", item.label)
                                : item.label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Suspense fallback={<RecentActivityFallback />}>
            <DashboardRecentActivitySection
              todayIsoDate={todayIsoDate}
              canViewPatients={canViewPatients}
              canManageAppointments={canManageAppointments}
            />
          </Suspense>
        </div>
      </DashboardPageShell>
    )
  } catch (error) {
    pagePerf.fail(error, { query_count: 0 })
    throw error
  }
}
