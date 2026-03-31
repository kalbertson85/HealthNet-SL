import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"

interface FacilityRow {
  id: string
  name: string
  code: string | null
  is_active: boolean
}
interface FacilityQueryRow {
  id: string | null
  name: string | null
  code: string | null
  is_active: boolean | null
}

export const revalidate = 0

export default async function FacilitiesAdminPage(props: {
  searchParams?: Promise<{ facility_id?: string }>
}) {
  const supabase = await createServerClient()
  const { user, profile } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }

  if (!can(rbacUser, "admin.settings.manage") && !can(rbacUser, "admin.export")) {
    redirect("/dashboard")
  }

  const resolvedSearchParams = props.searchParams ? await props.searchParams : undefined
  const editingFacilityId = (resolvedSearchParams?.facility_id || "").trim() || null

  const { data, error } = await supabase
    .from("facilities")
    .select("id, name, code, is_active")
    .order("name", { ascending: true })

  if (error) {
    console.error("[facilities-admin] Error loading facilities:", error.message || error)
  }

  const facilities: FacilityRow[] = ((data || []) as FacilityQueryRow[]).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    code: row.code ?? null,
    is_active: Boolean(row.is_active ?? true),
  }))

  const editingFacility = editingFacilityId ? facilities.find((f) => f.id === editingFacilityId) ?? null : null

  async function upsertFacility(formData: FormData) {
    "use server"

    const supabase = await createServerClient()
    const { user, profile } = await getSessionUserAndProfile()

    if (!user) {
      redirect("/auth/login")
    }

    const rbacUser = { id: user.id, role: (profile as { role?: string | null } | null)?.role ?? user.role ?? null }

    if (!can(rbacUser, "admin.settings.manage")) {
      redirect("/dashboard")
    }

    const id = (formData.get("facility_id") as string | null) || null
    const name = ((formData.get("name") as string | null) || "").trim()
    const codeRaw = ((formData.get("code") as string | null) || "").trim()
    const code = codeRaw || null
    const isActive = ((formData.get("is_active") as string | null) || "true").toLowerCase() !== "false"

    if (!name) {
      redirect("/dashboard/admin/facilities")
    }

    const payload = { name, code, is_active: isActive }

    if (id) {
      await supabase.from("facilities").update(payload).eq("id", id)
    } else {
      await supabase.from("facilities").insert(payload)
    }

    redirect("/dashboard/admin/facilities")
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Facilities</h1>
        <p className="text-muted-foreground text-sm">
          Manage hospital facilities and clinic codes used to tag visits and drive FHC reporting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingFacility ? "Edit facility" : "Add facility"}</CardTitle>
          <CardDescription>Use short, meaningful codes (e.g. opd, maternity, theatre1).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={upsertFacility} className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] md:items-end">
            <input type="hidden" name="facility_id" value={editingFacility?.id ?? ""} />
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="e.g. OPD Clinic"
                defaultValue={editingFacility?.name ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" placeholder="e.g. opd" defaultValue={editingFacility?.code ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="is_active">Active</Label>
              <select
                id="is_active"
                name="is_active"
                aria-label="Facility active status"
                defaultValue={editingFacility ? String(editingFacility.is_active) : "true"}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="flex justify-end md:col-span-3">
              <Button type="submit" size="sm">
                Save facility
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing facilities</CardTitle>
          <CardDescription>Codes are used when tagging visits and in FHC by facility reports.</CardDescription>
        </CardHeader>
        <CardContent>
          {facilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No facilities configured yet.</p>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Name</th>
                    <th className="py-2 font-medium">Code</th>
                    <th className="py-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {facilities.map((f) => (
                    <tr key={f.id} className="border-b last:border-0">
                      <td className="py-2">{f.name}</td>
                      <td className="py-2">{f.code || ""}</td>
                      <td className="py-2 flex items-center justify-between gap-2">
                        <span>{f.is_active ? "Yes" : "No"}</span>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/admin/facilities?facility_id=${f.id}`}>Edit</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
