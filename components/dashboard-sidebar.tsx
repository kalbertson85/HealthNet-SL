"use client"

import {
  Calendar,
  FileText,
  Pill,
  DollarSign,
  Settings,
  Users,
  BarChart3,
  Stethoscope,
  Bed,
  Bell,
  AlertCircle,
  Clock,
  Home,
  Activity,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn, ROLES, type Role } from "@/lib/utils"

interface DashboardSidebarProps {
  userRole?: string
}

export function DashboardSidebar({ userRole }: DashboardSidebarProps) {
  const pathname = usePathname()
  const normalizedRole = (userRole?.toLowerCase() as Role | undefined) ?? undefined

  const clinicalRoles = [
    ROLES.ADMIN,
    ROLES.FACILITY_ADMIN,
    ROLES.DOCTOR,
    ROLES.NURSE,
    ROLES.LAB_TECH,
    ROLES.PHARMACIST,
    ROLES.RECEPTIONIST,
  ] as Role[]

  const baseNavigation = [
    { name: "Dashboard", href: "/dashboard", icon: Home, roles: "all" as const },
    { name: "Patients", href: "/dashboard/patients", icon: Users, roles: "all" as const },
    { name: "Records", href: "/dashboard/records", icon: FileText, roles: "all" as const },
    { name: "Appointments", href: "/dashboard/appointments", icon: Calendar, roles: "all" as const },
    { name: "Emergency", href: "/dashboard/emergency", icon: AlertCircle, roles: "clinical" as const },
    { name: "Triage", href: "/dashboard/triage", icon: Activity, roles: "clinical" as const },
    { name: "Queue", href: "/dashboard/queue", icon: Clock, roles: "clinical" as const },
    {
      name: "Doctor",
      href: "/dashboard/doctor",
      icon: Stethoscope,
      roles: [ROLES.DOCTOR, ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[],
    },
    // Standalone Prescriptions and Lab Tests are hidden for pure doctors;
    // doctors access these via the Doctor hub instead.
    { name: "Prescriptions", href: "/dashboard/prescriptions", icon: Pill, roles: [ROLES.PHARMACIST, ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[] },
    { name: "Lab Tests", href: "/dashboard/lab", icon: FileText, roles: [ROLES.LAB_TECH, ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[] },
    { name: "Radiology", href: "/dashboard/radiology", icon: FileText, roles: [ROLES.LAB_TECH, ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[] },
    { name: "Pharmacy", href: "/dashboard/pharmacy", icon: Stethoscope, roles: [ROLES.PHARMACIST, ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[] },
    { name: "Inpatient", href: "/dashboard/inpatient", icon: Bed, roles: "clinical" as const },
    { name: "Surgery", href: "/dashboard/surgery", icon: Activity, roles: "clinical" as const },
    { name: "Nursing", href: "/dashboard/nursing", icon: Bed, roles: "clinical" as const },
    { name: "Billing", href: "/dashboard/billing", icon: DollarSign, roles: [ROLES.CASHIER, ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[] },
    { name: "Notifications", href: "/dashboard/notifications", icon: Bell, roles: "all" as const },
    { name: "Reports", href: "/dashboard/reports", icon: BarChart3, roles: [ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[] },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, roles: "all" as const },
    { name: "Admin", href: "/dashboard/admin", icon: Settings, roles: [ROLES.ADMIN, ROLES.FACILITY_ADMIN] as Role[] },
  ]

  const navigation = baseNavigation.filter((item) => {
    if (!normalizedRole) return true

    if (item.roles === "all") return true
    if (item.roles === "clinical") {
      return clinicalRoles.includes(normalizedRole)
    }

    return (item.roles as Role[]).includes(normalizedRole)
  })

  return (
    <aside className="w-64 border-r bg-gradient-to-b from-sky-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="h-20 border-b bg-white px-0 py-0">
        <Link href="/dashboard" className="block h-full w-full">
          <div className="relative h-full w-full overflow-hidden">
            <Image
              src="/healthnet-logo.png"
              alt="HealthNet-SL HMS logo"
              fill
              className="object-cover"
              priority
            />
          </div>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-slate-100 text-slate-900 shadow-sm"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
