import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { StatCard } from "@/components/stat-card"
import { TableCard } from "@/components/table-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Activity, Pill } from "lucide-react"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

export const revalidate = 0

interface PharmacyPrescriptionRow {
  id: string
  prescription_number: string
  status: string
  created_at: string
  doctor_id: string | null
  patients?: { full_name?: string | null; patient_number?: string | null } | null
}

interface DoctorProfile {
  id: string
  full_name: string | null
}

interface StockRow {
  id: string
  quantity_on_hand: number
  reorder_level: number
  location: string | null
  expiry_date?: string | null
  medications?: {
    name?: string | null
    form?: string | null
    strength?: string | null
    unit?: string | null
  } | null
}

interface PharmacyPageSearchParams {
  q?: string
  stock_filter?: string
}

export default async function PharmacyPage(props: { searchParams: Promise<PharmacyPageSearchParams> }) {
  const supabase = await createServerClient()

  const searchParams = await props.searchParams
  const query = (await searchParams).q?.toLowerCase().trim() || ""
  const stockFilter = (await searchParams).stock_filter || "all"

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "pharmacy.manage")) {
    redirect("/dashboard")
  }

  const { data: prescriptions, error: prescriptionsError } = await supabase
    .from("prescriptions")
    .select(
      `id, prescription_number, status, created_at, doctor_id,
       patients(full_name, patient_number)`,
    )
    .order("created_at", { ascending: false })
    .limit(100)

  if (prescriptionsError) {
    console.error("[v0] Error loading pharmacy prescriptions:", prescriptionsError.message || prescriptionsError)
  }

  const allPrescriptions = (prescriptions || []) as PharmacyPrescriptionRow[]

  // Load basic stock overview (medications with stock and reorder levels)
  const { data: stockRows, error: stockError } = await supabase
    .from("medication_stock")
    .select(
      `id, quantity_on_hand, reorder_level, location, expiry_date,
       medications(name, form, strength, unit)`
    )
    .order("quantity_on_hand", { ascending: true })
    .limit(20)

  if (stockError) {
    console.error("[v0] Error loading medication stock for pharmacy:", stockError.message || stockError)
  }

  const stock = (stockRows || []) as StockRow[]

  const filteredStock = stock.filter((row) => {
    const qty = Number(row.quantity_on_hand ?? 0)
    const reorder = Number(row.reorder_level ?? 0)

    const isLow = reorder > 0 && qty <= reorder

    let diffDays: number | null = null
    if (row.expiry_date) {
      const exp = new Date(row.expiry_date)
      const today = new Date()
      diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
    }

    switch (stockFilter) {
      case "low":
        return isLow
      case "expiring_soon":
        return diffDays !== null && diffDays >= 0 && diffDays <= 30
      case "expired":
        return diffDays !== null && diffDays < 0
      case "all":
      default:
        return true
    }
  })

  const doctorIds = Array.from(
    new Set(allPrescriptions.map((p) => p.doctor_id).filter((id): id is string => Boolean(id))),
  )

  let doctorMap: Record<string, DoctorProfile> = {}

  if (doctorIds.length > 0) {
    const { data: doctors, error: doctorsError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", doctorIds)

    if (doctorsError) {
      console.error("[v0] Error loading doctor profiles for pharmacy:", doctorsError.message || doctorsError)
    }

    doctorMap = Object.fromEntries((doctors || []).map((d: DoctorProfile) => [d.id, d]))
  }
  const pendingBase = allPrescriptions.filter((p) => p.status === "pending")

  const pending = query
    ? pendingBase.filter((p) => {
        const haystack = [
          p.prescription_number,
          p.patients?.full_name,
          p.patients?.patient_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(query)
      })
    : pendingBase
  const lowStockCount = stock.filter((row) => {
    const qty = Number(row.quantity_on_hand ?? 0)
    const reorder = Number(row.reorder_level ?? 0)
    return reorder > 0 && qty <= reorder
  }).length

  const { expiringSoonCount, expiredCount } = stock.reduce(
    (acc, row) => {
      if (!row.expiry_date) return acc
      const exp = new Date(row.expiry_date)
      const today = new Date()
      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86400000)

      if (diffDays < 0) {
        acc.expiredCount += 1
      } else if (diffDays <= 30) {
        acc.expiringSoonCount += 1
      }
      return acc
    },
    { expiringSoonCount: 0, expiredCount: 0 },
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Pharmacy</h1>
          <p className="text-muted-foreground">
            Dispense medications for patient prescriptions, manage ward requests, and record stock movements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/pharmacy/ward-requests">Ward requests</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/pharmacy/controlled-drugs">Controlled drug register</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/pharmacy/new">Add medicine</Link>
          </Button>
        </div>
      </div>

      {/* Stock overview */}
      <TableCard
        title="Medication stock overview"
        description="Recently queried medications and their current stock levels."
      >
        <form method="GET" className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <input type="hidden" name="q" value={query} />
          <label className="text-muted-foreground" htmlFor="stock_filter">
            Stock filter
          </label>
          <select
            id="stock_filter"
            name="stock_filter"
            defaultValue={stockFilter}
            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All items</option>
            <option value="low">Low stock</option>
            <option value="expiring_soon">Expiring soon (≤ 30 days)</option>
            <option value="expired">Expired</option>
          </select>
          <Button type="submit" size="sm" variant="outline">
            Apply
          </Button>
        </form>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Medication</th>
              <th className="py-2 font-medium">Location</th>
              <th className="py-2 font-medium">On hand</th>
              <th className="py-2 font-medium">Reorder level</th>
              <th className="py-2 font-medium">Expiry status</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStock.length > 0 ? (
              filteredStock.map((row) => {
                const qty = Number(row.quantity_on_hand ?? 0)
                const reorder = Number(row.reorder_level ?? 0)
                const isLow = reorder > 0 && qty <= reorder

                let expiryLabel: string = "No expiry set"
                let expiryClass = "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"

                if (row.expiry_date) {
                  const exp = new Date(row.expiry_date)
                  const today = new Date()
                  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86400000)

                  if (diffDays < 0) {
                    expiryLabel = "Expired"
                    expiryClass =
                      "inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                  } else if (diffDays <= 30) {
                    expiryLabel = `Expiring in ${diffDays} day${diffDays === 1 ? "" : "s"}`
                    expiryClass =
                      "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                  } else {
                    expiryLabel = exp.toLocaleDateString()
                    expiryClass =
                      "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                  }
                }

                const nameParts = [
                  row.medications?.name,
                  row.medications?.strength,
                  row.medications?.form,
                ].filter(Boolean)

                return (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 text-sm font-medium">
                      {nameParts.join(" ") || "Unknown medication"}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {row.location || "Main Pharmacy"}
                    </td>
                    <td className="py-2 text-sm">
                      <span
                        className={
                          isLow
                            ? "inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                            : "font-medium"
                        }
                      >
                        {qty}
                        {isLow && <span className="ml-1 hidden sm:inline"> (Low)</span>}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{reorder || "-"}</td>
                    <td className="py-2">
                      <span className={expiryClass}>{expiryLabel}</span>
                    </td>
                    <td className="py-2 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/pharmacy/stock/${row.id}`}>Edit</Link>
                      </Button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  <p className="mb-2">No medication stock records found yet.</p>
                  <p className="mb-4">
                    Use the <span className="font-medium">Add medicine</span> action above to start capturing your
                    formulary and stock levels.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/pharmacy/new">Add medicine</Link>
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Prescriptions to dispense"
          value={pending.length}
          description="Patients waiting for medication"
          icon={<Pill className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Low-stock items"
          value={lowStockCount}
          description="Medications at or below reorder level"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Expiring soon"
          value={expiringSoonCount}
          description="Stock expiring in the next 30 days"
          icon={<Pill className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Expired items"
          value={expiredCount}
          description="Medications past their expiry date"
          icon={<Pill className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <TableCard
        title="Prescriptions to dispense"
        description="Prescriptions awaiting pharmacy processing. Use the prescription detail page to complete dispensing."
      >
        <form method="GET" className="mb-2 flex gap-2 text-xs">
          <input
            type="text"
            name="q"
            defaultValue={query}
            className="flex h-8 w-full max-w-xs rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="Search by prescription # or patient"
          />
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Prescription #</th>
              <th className="py-2 font-medium">Patient</th>
              <th className="py-2 font-medium">Doctor</th>
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.length > 0 ? (
              pending.map((prescription: PharmacyPrescriptionRow) => (
                <tr key={prescription.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-2 font-medium">{prescription.prescription_number}</td>
                  <td className="py-2">
                    <div>
                      <p className="font-medium">{prescription.patients?.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{prescription.patients?.patient_number}</p>
                    </div>
                  </td>
                  <td className="py-2 text-sm">
                    Dr. {prescription.doctor_id ? doctorMap[prescription.doctor_id]?.full_name || "Unassigned" : "Unassigned"}
                  </td>
                  <td className="py-2 text-sm">
                    {prescription.created_at ? new Date(prescription.created_at).toLocaleDateString() : ""}
                  </td>
                  <td className="py-2">
                    <Badge variant={prescription.status === "pending" ? "default" : "secondary"}>
                      {prescription.status}
                    </Badge>
                  </td>
                  <td className="py-2 text-right space-x-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/prescriptions/${prescription.id}`}>Open prescription</Link>
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  No pending prescriptions to dispense
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>
    </div>
  )
}
