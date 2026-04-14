import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

async function updateCompany(formData: FormData) {
  "use server"

  const { supabase, user } = await requireServerActionPermission("admin.settings.manage")
  const parsed = z
    .object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      address: z.string().trim().max(500).optional(),
      contact_person: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(50).optional(),
      email: z.string().trim().email().max(320).optional().or(z.literal("")),
      terms_preset: z.string().trim().max(200).optional(),
      terms: z.string().trim().max(1000).optional(),
      industry_type: z.string().trim().max(100).optional(),
      invoice_footer_text: z.string().trim().max(1000).optional(),
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name"),
      address: formData.get("address"),
      contact_person: formData.get("contact_person"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      terms_preset: formData.get("terms_preset"),
      terms: formData.get("terms"),
      industry_type: formData.get("industry_type"),
      invoice_footer_text: formData.get("invoice_footer_text"),
    })

  if (!parsed.success) {
    redirect("/dashboard/settings/companies")
  }
  const id = parsed.data.id
  const name = parsed.data.name
  const address = parsed.data.address || null
  const contactPerson = parsed.data.contact_person || null
  const phone = parsed.data.phone || null
  const email = parsed.data.email || null
  const termsPreset = parsed.data.terms_preset || ""
  const termsCustom = parsed.data.terms || null
  const industryType = parsed.data.industry_type || null
  const invoiceFooterText = parsed.data.invoice_footer_text || null

  const terms = termsCustom || termsPreset || null

  const { data: existingCompany, error: existingCompanyError } = await supabase
    .from("companies")
    .select("id, name, address, contact_person, phone, email, terms, industry_type, invoice_footer_text")
    .eq("id", id)
    .maybeSingle()
  if (existingCompanyError || !existingCompany?.id) {
    redirect("/dashboard/settings/companies?error=company_not_found")
  }

  const updatedPayload = {
    name,
    address,
    contact_person: contactPerson,
    phone,
    email,
    terms,
    industry_type: industryType,
    invoice_footer_text: invoiceFooterText,
  }
  const { error: updateError } = await supabase
    .from("companies")
    .update(updatedPayload)
    .eq("id", id)
  if (updateError) {
    redirect("/dashboard/settings/companies?error=company_update_failed")
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "company_update",
  })
  if (auditError) {
    await supabase
      .from("companies")
      .update({
        name: existingCompany.name,
        address: existingCompany.address,
        contact_person: existingCompany.contact_person,
        phone: existingCompany.phone,
        email: existingCompany.email,
        terms: existingCompany.terms,
        industry_type: existingCompany.industry_type,
        invoice_footer_text: existingCompany.invoice_footer_text,
      })
      .eq("id", id)
    redirect("/dashboard/settings/companies?error=audit_log_failed")
  }

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
