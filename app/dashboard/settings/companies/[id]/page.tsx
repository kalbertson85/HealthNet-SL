import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

async function updateCompany(formData: FormData) {
  "use server"

  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const id = ((formData.get("id") as string | null) || "").trim()
  const name = ((formData.get("name") as string | null) || "").trim()
  const address = ((formData.get("address") as string | null) || "").trim() || null
  const contactPerson = ((formData.get("contact_person") as string | null) || "").trim() || null
  const phone = ((formData.get("phone") as string | null) || "").trim() || null
  const email = ((formData.get("email") as string | null) || "").trim() || null
  const termsPreset = ((formData.get("terms_preset") as string | null) || "").trim()
  const termsCustom = ((formData.get("terms") as string | null) || "").trim() || null
  const industryType = ((formData.get("industry_type") as string | null) || "").trim() || null
  const invoiceFooterText = ((formData.get("invoice_footer_text") as string | null) || "").trim() || null

  if (!id || !name) {
    redirect("/dashboard/settings/companies")
  }

  const terms = termsCustom || termsPreset || null

  await supabase
    .from("companies")
    .update({
      name,
      address,
      contact_person: contactPerson,
      phone,
      email,
      terms,
      industry_type: industryType,
      invoice_footer_text: invoiceFooterText,
    })
    .eq("id", id)

  redirect("/dashboard/settings/companies")
}

export default async function EditCompanyPage(props: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const { id } = await props.params

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, address, contact_person, phone, email, terms, industry_type, invoice_footer_text")
    .eq("id", id)
    .maybeSingle()

  if (!company) {
    redirect("/dashboard/settings/companies")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/companies">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to companies
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit company</h1>
            <p className="text-muted-foreground">Update billing and contact details for this corporate client.</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{company.name}</CardTitle>
          <CardDescription>Adjust fields below and save to update this company.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateCompany} className="space-y-3">
            <input type="hidden" name="id" value={company.id} />

            <div className="space-y-1">
              <label htmlFor="name" className="text-sm font-medium">
                Company name
              </label>
              <Input id="name" name="name" defaultValue={company.name || ""} required />
            </div>

            <div className="space-y-1">
              <label htmlFor="address" className="text-sm font-medium">
                Address
              </label>
              <Input id="address" name="address" defaultValue={company.address || ""} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="contact_person" className="text-sm font-medium">
                  Contact person
                </label>
                <Input id="contact_person" name="contact_person" defaultValue={company.contact_person || ""} />
              </div>
              <div className="space-y-1">
                <label htmlFor="phone" className="text-sm font-medium">
                  Phone
                </label>
                <Input id="phone" name="phone" defaultValue={company.phone || ""} />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input id="email" name="email" defaultValue={company.email || ""} />
            </div>

            <div className="space-y-1">
              <label htmlFor="industry_type" className="text-sm font-medium">
                Industry type
              </label>
              <Input id="industry_type" name="industry_type" defaultValue={company.industry_type || ""} />
            </div>

            <div className="space-y-1">
              <label htmlFor="terms" className="text-sm font-medium">
                Billing terms
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  id="terms_preset"
                  name="terms_preset"
                  aria-label="Billing terms preset"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  defaultValue=""
                >
                  <option value="">No preset</option>
                  <option value="Payable within 30 days">Payable within 30 days</option>
                  <option value="Payable within 60 days">Payable within 60 days</option>
                  <option value="Payable on receipt">Payable on receipt</option>
                </select>
                <Input
                  id="terms"
                  name="terms"
                  defaultValue={company.terms || ""}
                  placeholder="Optional custom terms or overrides"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="invoice_footer_text" className="text-sm font-medium">
                Invoice footer
              </label>
              <Input
                id="invoice_footer_text"
                name="invoice_footer_text"
                defaultValue={company.invoice_footer_text || ""}
                placeholder="Optional footer text shown on invoices for this company"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
