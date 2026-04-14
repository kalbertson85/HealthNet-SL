import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { uploadCompanyLogo } from "@/lib/storage"
import { requireServerActionPermission } from "@/lib/server-action-security"
import { z } from "zod"

async function saveCompany(formData: FormData) {
  "use server"

  const { supabase, user } = await requireServerActionPermission("admin.settings.manage")
  const parsed = z
    .object({
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
    redirect("/dashboard/settings/companies?error=missing_name")
  }

  const name = parsed.data.name
  const address = parsed.data.address || null
  const contactPerson = parsed.data.contact_person || null
  const phone = parsed.data.phone || null
  const email = parsed.data.email || null
  const termsPreset = parsed.data.terms_preset || ""
  const termsCustom = parsed.data.terms || null
  const industryType = parsed.data.industry_type || null
  const invoiceFooterText = parsed.data.invoice_footer_text || null

  const logoUrlFromInput = ((formData.get("logo_url") as string | null) || "").trim() || null
  const logoFile = formData.get("logo_file") as File | null

  let finalLogoUrl: string | null = logoUrlFromInput

  if (logoFile && logoFile.size > 0) {
    try {
      finalLogoUrl = await uploadCompanyLogo(logoFile)
    } catch (e) {
      console.error("[v0] Error uploading company logo", e)
    }
  }

  const terms = termsCustom || termsPreset || null

  const createPayload = {
    name,
    address,
    contact_person: contactPerson,
    phone,
    email,
    terms,
    logo_url: finalLogoUrl,
    industry_type: industryType,
    invoice_footer_text: invoiceFooterText,
  }
  const { data: createdCompany, error: createError } = await supabase
    .from("companies")
    .insert(createPayload)
    .select("id")
    .single()
  if (createError || !createdCompany?.id) {
    redirect("/dashboard/settings/companies?error=company_create_failed")
  }

  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: "company_create",
  })
  if (auditError) {
    await supabase.from("companies").delete().eq("id", createdCompany.id)
    redirect("/dashboard/settings/companies?error=audit_log_failed")
  }

  redirect("/dashboard/settings/companies")
}

export default async function CompaniesSettingsPage() {
  const supabase = await createServerClient()
  const { user } = await getSessionUserAndProfile()

  if (!user) {
    redirect("/auth/login")
  }

  if (!can(user, "admin.export") && !can(user, "admin.settings.manage")) {
    redirect("/dashboard")
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, address, contact_person, phone, email, terms, logo_url, industry_type, invoice_footer_text")
    .order("name", { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Settings
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Company Billing Profiles</h1>
            <p className="text-muted-foreground">
              Manage corporate clients that can be set as payers on patient invoices.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Existing companies</CardTitle>
            <CardDescription>Companies available to be selected as payers during billing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {(!companies || companies.length === 0) && <p>No companies have been configured yet.</p>}
            {companies?.map((company) => (
              <div key={company.id} className="rounded border bg-card px-3 py-2 space-y-1">
                <div className="flex items-center gap-3">
                  {company.logo_url && (
                    <img
                      src={company.logo_url}
                      alt={`${company.name} logo`}
                      className="h-8 w-8 rounded border bg-white object-contain"
                    />
                  )}
                  <div className="font-medium text-foreground">{company.name}</div>
                </div>
                {company.address && <div className="text-xs">{company.address}</div>}
                <div className="mt-1 text-xs text-muted-foreground">
                  {company.contact_person && <span>Contact: {company.contact_person}. </span>}
                  {company.phone && <span>Phone: {company.phone}. </span>}
                  {company.email && <span>Email: {company.email}</span>}
                </div>
                {company.industry_type && (
                  <div className="mt-1 text-xs text-muted-foreground">Industry: {company.industry_type}</div>
                )}
                {company.terms && (
                  <div className="mt-1 text-xs text-muted-foreground">Terms: {company.terms}</div>
                )}
                {company.invoice_footer_text && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Invoice footer: {company.invoice_footer_text}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/settings/companies/${company.id}`}>Edit</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/settings/companies/${company.id}/employees`}>
                      Manage employees & insurance
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/reports/company-insurance?company_id=${company.id}`}>
                      Insurance coverage
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/billing?company_id=${company.id}`}>Company invoices</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add new company</CardTitle>
            <CardDescription>Register a new corporate client for billing and insurance purposes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveCompany} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="name" className="text-sm font-medium">
                  Company name
                </label>
                <Input id="name" name="name" required placeholder="e.g. ABC Mining Company" />
              </div>

              <div className="space-y-1">
                <label htmlFor="address" className="text-sm font-medium">
                  Address
                </label>
                <Input id="address" name="address" placeholder="Street, city" />
              </div>

              <div className="space-y-1">
                <label htmlFor="contact_person" className="text-sm font-medium">
                  Contact person
                </label>
                <Input id="contact_person" name="contact_person" placeholder="Name of HR or account contact" />
              </div>

              <div className="space-y-1">
                <label htmlFor="phone" className="text-sm font-medium">
                  Phone
                </label>
                <Input id="phone" name="phone" placeholder="Contact phone number" />
              </div>

              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input id="email" name="email" placeholder="billing@example.com" />
              </div>

              <div className="space-y-1">
                <label htmlFor="industry_type" className="text-sm font-medium">
                  Industry type
                </label>
                <Input
                  id="industry_type"
                  name="industry_type"
                  placeholder="e.g. Mining, Telecom, Bank, NGO, Government"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="logo_url" className="text-sm font-medium">
                  Logo URL
                </label>
                <Input id="logo_url" name="logo_url" placeholder="https://.../company-logo.png" />
                <p className="text-xs text-muted-foreground">
                  Optionally paste a public logo URL or upload a file below.
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor="logo_file" className="text-sm font-medium">
                  Upload logo
                </label>
                <Input id="logo_file" name="logo_file" type="file" accept="image/*" />
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
                  placeholder="Optional footer text shown on invoices for this company"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit">Save company</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
