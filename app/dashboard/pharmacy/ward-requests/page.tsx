import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"

export const revalidate = 0

interface WardRequestRow {
  id: string
  ward_name: string
  status: string
  notes: string | null
  created_at: string
  patients?: { full_name?: string | null; patient_number?: string | null } | null
}

interface WardRequestItemRow {
  id: string
  request_id: string
  quantity_requested: number
  quantity_approved: number | null
  quantity_dispensed: number | null
  dose: string | null
  frequency: string | null
  route: string | null
  duration: string | null
  medications?: { name?: string | null; strength?: string | null; form?: string | null } | null
}
interface WardRequestItemQueryRow {
  id: string
  request_id: string
  quantity_requested: number
  quantity_approved: number | null
  quantity_dispensed: number | null
  dose: string | null
  frequency: string | null
  route: string | null
  duration: string | null
  medications?: WardRequestItemRow["medications"]
}

export default async function WardRequestsPage() {
  const supabase = await createServerClient()

  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
  if (!can(rbacUser, "pharmacy.manage")) {
    redirect("/dashboard")
  }

  const { data: requestsData } = await supabase
    .from("ward_medication_requests")
    .select(
      `id, ward_name, status, notes, created_at,
       patients(full_name, patient_number)`,
    )
    .order("created_at", { ascending: false })
    .limit(100)

  const requests = (requestsData || []) as WardRequestRow[]
  const requestIds = requests.map((r) => r.id)

  let itemsByRequestId = new Map<string, WardRequestItemRow[]>()

  if (requestIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("ward_medication_request_items")
      .select(
        `id, request_id, quantity_requested, quantity_approved, quantity_dispensed, dose, frequency, route, duration,
         medications(name, strength, form)`,
      )
      .in("request_id", requestIds)

    itemsByRequestId = new Map<string, WardRequestItemRow[]>()
    for (const row of (itemsData || []) as WardRequestItemQueryRow[]) {
      const reqId = row.request_id
      const current = itemsByRequestId.get(reqId) ?? []
      current.push({
        id: row.id,
        request_id: reqId,
        quantity_requested: row.quantity_requested,
        quantity_approved: row.quantity_approved ?? null,
        quantity_dispensed: row.quantity_dispensed ?? null,
        dose: row.dose ?? null,
        frequency: row.frequency ?? null,
        route: row.route ?? null,
        duration: row.duration ?? null,
        medications: row.medications,
      })
      itemsByRequestId.set(reqId, current)
    }
  }

  async function markRequestDispensed(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "pharmacy.manage")) {
      redirect("/dashboard")
    }

    const requestId = (formData.get("request_id") as string | null) ?? null
    if (!requestId) {
      redirect("/dashboard/pharmacy/ward-requests")
    }

    // Mark header as dispensed
    await supabase
      .from("ward_medication_requests")
      .update({ status: "dispensed" })
      .eq("id", requestId)

    // For any items where quantity_approved is set but quantity_dispensed is null, copy approved -> dispensed
    const { error: syncError } = await supabase.rpc("sync_ward_request_dispensed_quantities", { p_request_id: requestId })
    if (syncError) {
      console.error("[pharmacy] Error syncing ward request quantities:", syncError.message || syncError)
    }

    redirect("/dashboard/pharmacy/ward-requests")
  }

  async function approveItem(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "pharmacy.manage")) {
      redirect("/dashboard")
    }

    const itemId = (formData.get("item_id") as string | null) ?? null
    const qtyRaw = (formData.get("quantity_approved") as string | null) ?? null
    if (!itemId) {
      redirect("/dashboard/pharmacy/ward-requests")
    }

    const qty = qtyRaw ? Number.parseInt(qtyRaw, 10) : null

    await supabase
      .from("ward_medication_request_items")
      .update({
        status: "approved",
        quantity_approved: qty,
        approved_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", itemId)

    redirect("/dashboard/pharmacy/ward-requests")
  }

  async function rejectItem(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }
    if (!can(rbacUser, "pharmacy.manage")) {
      redirect("/dashboard")
    }

    const itemId = (formData.get("item_id") as string | null) ?? null
    if (!itemId) {
      redirect("/dashboard/pharmacy/ward-requests")
    }

    await supabase
      .from("ward_medication_request_items")
      .update({
        status: "rejected",
        quantity_approved: 0,
        approved_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", itemId)

    redirect("/dashboard/pharmacy/ward-requests")
  }

  const statusVariant = (status: string): "default" | "secondary" | "outline" => {
    switch (status) {
      case "pending":
        return "outline"
      case "approved":
        return "default"
      case "dispensed":
        return "secondary"
      case "rejected":
        return "secondary"
      default:
        return "outline"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ward medication requests</h1>
          <p className="text-muted-foreground text-sm">
            Review and process medication requests coming from wards or nursing staff.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/pharmacy">Back to Pharmacy</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>Requests are ordered with the newest at the top.</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ward medication requests have been recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => {
                const items = itemsByRequestId.get(req.id) || []

                return (
                  <Card key={req.id} className="border-muted">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">
                          {req.patients?.full_name || "Unknown patient"}
                        </CardTitle>
                        <CardDescription>
                          {req.patients?.patient_number || "-"} • Ward {req.ward_name} •
                          {" "}
                          {new Date(req.created_at).toLocaleString()}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={statusVariant(req.status)} className="capitalize">
                          {req.status}
                        </Badge>
                        {req.notes && <p className="max-w-xs text-xs text-muted-foreground">{req.notes}</p>}
                        {req.status !== "dispensed" && (
                          <form action={markRequestDispensed}>
                            <input type="hidden" name="request_id" value={req.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Mark as dispensed
                            </Button>
                          </form>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No line items found for this request.</p>
                      ) : (
                        <Table className="text-xs">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Medication</TableHead>
                              <TableHead>Order</TableHead>
                              <TableHead>Qty requested</TableHead>
                              <TableHead>Qty approved</TableHead>
                              <TableHead>Qty dispensed</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item) => {
                              const medNameParts = [
                                item.medications?.name,
                                item.medications?.strength,
                                item.medications?.form,
                              ].filter(Boolean)

                              return (
                                <TableRow key={item.id}>
                                  <TableCell className="font-medium">
                                    {medNameParts.join(" ") || "Unknown"}
                                  </TableCell>
                                  <TableCell>
                                    <div className="space-y-0.5">
                                      {item.dose && <p>Dose: {item.dose}</p>}
                                      {item.frequency && <p>Freq: {item.frequency}</p>}
                                      {item.route && <p>Route: {item.route}</p>}
                                      {item.duration && <p>Duration: {item.duration}</p>}
                                    </div>
                                  </TableCell>
                                  <TableCell>{item.quantity_requested}</TableCell>
                                  <TableCell>{item.quantity_approved ?? "-"}</TableCell>
                                  <TableCell>{item.quantity_dispensed ?? "-"}</TableCell>
                                  <TableCell className="text-right">
                                    {req.status !== "dispensed" && (
                                      <div className="flex flex-wrap justify-end gap-1">
                                        <form action={approveItem} className="flex items-center gap-1 text-[11px]">
                                          <input type="hidden" name="item_id" value={item.id} />
                                          <input
                                            type="number"
                                            name="quantity_approved"
                                            min={0}
                                            defaultValue={item.quantity_approved ?? item.quantity_requested}
                                            className="h-7 w-16 rounded border border-input bg-background px-1 text-[11px]"
                                            aria-label="Quantity approved"
                                          />
                                          <Button type="submit" size="sm" variant="outline">
                                            Approve
                                          </Button>
                                        </form>
                                        <form action={rejectItem}>
                                          <input type="hidden" name="item_id" value={item.id} />
                                          <Button type="submit" size="sm" variant="outline">
                                            Reject
                                          </Button>
                                        </form>
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
