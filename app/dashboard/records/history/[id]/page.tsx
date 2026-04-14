import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { getSessionUserAndProfile } from "@/app/actions/auth"
import { can } from "@/lib/utils"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency, formatDateTime } from "@/lib/locale-format"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type AuditRow = {
  id: string
  action: string
  user_id: string | null
  role: string | null
  entity_type: string | null
  entity_id: string | null
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown> | null
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  created_at: string | null
  occurred_at: string | null
}

function renderJsonValue(value: unknown, settings: Awaited<ReturnType<typeof getGlobalSettings>>) {
  if (typeof value === "number") return formatCurrency(value, settings)
  if (typeof value === "string") return value
  if (typeof value === "boolean") return value ? "true" : "false"
  if (value == null) return "-"
  return JSON.stringify(value)
}

export default async function RecordsHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const settings = await getGlobalSettings()
  const { user } = await getSessionUserAndProfile()

  if (!user) redirect("/auth/login")
  if (!can(user, "patients.view")) redirect("/dashboard")

  const { id } = await params

  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, patient_number")
    .eq("id", id)
    .maybeSingle()

  if (!patient) notFound()

  const { data: invoices } = await supabase.from("invoices").select("id, invoice_number").eq("patient_id", id)
  const invoiceIds = (invoices || []).map((row) => row.id as string).filter(Boolean)
  const invoiceLabelById = new Map<string, string>()
  for (const invoice of invoices || []) {
    invoiceLabelById.set(invoice.id as string, (invoice.invoice_number as string | null) || (invoice.id as string))
  }

  const { data: claimRows } = await (invoiceIds.length
    ? supabase.from("insurance_claims").select("id, invoice_id").in("invoice_id", invoiceIds)
    : Promise.resolve({ data: [] as Array<{ id: string; invoice_id: string | null }> }))
  const claimIds = (claimRows || []).map((row) => row.id as string).filter(Boolean)

  const { data: batchItemRows } = await (invoiceIds.length
    ? supabase.from("insurance_billing_batch_items").select("batch_id, invoice_id").in("invoice_id", invoiceIds)
    : Promise.resolve({ data: [] as Array<{ batch_id: string | null; invoice_id: string | null }> }))
  const batchIds = Array.from(new Set((batchItemRows || []).map((row) => row.batch_id as string).filter(Boolean)))

  const { data: batchRows } = await (batchIds.length
    ? supabase.from("insurance_billing_batches").select("id, batch_number").in("id", batchIds)
    : Promise.resolve({ data: [] as Array<{ id: string; batch_number: string | null }> }))
  const batchLabelById = new Map<string, string>()
  for (const batch of batchRows || []) {
    batchLabelById.set(batch.id as string, (batch.batch_number as string | null) || (batch.id as string))
  }

  const [{ data: patientAudit }, { data: invoiceAudit }, { data: claimAudit }, { data: batchAudit }, { data: paymentAudit }] =
    await Promise.all([
      supabase
        .from("audit_logs")
        .select(
          "id, action, user_id, role, entity_type, entity_id, resource_type, resource_id, metadata, before_state, after_state, created_at, occurred_at",
        )
        .or(`entity_id.eq.${id},resource_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(100),
      invoiceIds.length
        ? supabase
            .from("audit_logs")
            .select(
              "id, action, user_id, role, entity_type, entity_id, resource_type, resource_id, metadata, before_state, after_state, created_at, occurred_at",
            )
            .in("resource_id", invoiceIds)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as AuditRow[] }),
      claimIds.length
        ? supabase
            .from("audit_logs")
            .select(
              "id, action, user_id, role, entity_type, entity_id, resource_type, resource_id, metadata, before_state, after_state, created_at, occurred_at",
            )
            .in("resource_id", claimIds)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as AuditRow[] }),
      batchIds.length
        ? supabase
            .from("audit_logs")
            .select(
              "id, action, user_id, role, entity_type, entity_id, resource_type, resource_id, metadata, before_state, after_state, created_at, occurred_at",
            )
            .in("resource_id", batchIds)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as AuditRow[] }),
      batchIds.length
        ? supabase
            .from("audit_logs")
            .select(
              "id, action, user_id, role, entity_type, entity_id, resource_type, resource_id, metadata, before_state, after_state, created_at, occurred_at",
            )
            .contains("metadata", { patient_id: id })
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as AuditRow[] }),
    ])

  const actorIds = Array.from(
    new Set(
      [...(patientAudit || []), ...(invoiceAudit || []), ...(claimAudit || []), ...(batchAudit || []), ...(paymentAudit || [])]
        .map((row) => row.user_id)
        .filter(Boolean),
    ),
  ) as string[]

  const actorLabelById = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, role").in("id", actorIds)
    for (const profile of profiles || []) {
      const label = [profile.full_name as string | null, profile.role ? `(${profile.role})` : null].filter(Boolean).join(" ")
      actorLabelById.set(profile.id as string, label || (profile.id as string))
    }
  }

  const combined = [
    ...(patientAudit || []),
    ...(invoiceAudit || []),
    ...(claimAudit || []),
    ...(batchAudit || []),
    ...(paymentAudit || []),
  ] as AuditRow[]

  const seen = new Set<string>()
  const rows = combined
    .filter((row) => {
      if (seen.has(row.id)) return false
      seen.add(row.id)
      return true
    })
    .sort((a, b) => {
      const aTs = new Date(a.created_at || a.occurred_at || 0).getTime()
      const bTs = new Date(b.created_at || b.occurred_at || 0).getTime()
      return bTs - aTs
    })

  const resolveSubject = (row: AuditRow) => {
    const entityType = row.entity_type || row.resource_type || "record"
    const entityId = row.entity_id || row.resource_id || ""
    if (entityType === "invoice") return `Invoice ${invoiceLabelById.get(entityId) || entityId}`
    if (entityType === "insurance_batch") return `Insurance batch ${batchLabelById.get(entityId) || entityId}`
    if (entityType === "insurance_claim") return "Insurance claim"
    if (entityType === "patient") return "Patient record"
    return entityType
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patient history</h1>
          <p className="text-sm text-muted-foreground">
            {patient.full_name || "Unknown patient"} · {patient.patient_number || "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/records">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Records
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/patients/${id}`}>Full record</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit timeline</CardTitle>
          <CardDescription>
            Central history for patient updates, billing edits, and insurance changes linked to this patient.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No central audit history has been recorded for this patient yet.
            </div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{resolveSubject(row)}</Badge>
                      <span className="text-sm font-medium">{row.action}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(row.created_at || row.occurred_at, settings)} ·{" "}
                      {row.user_id ? actorLabelById.get(row.user_id) || row.user_id : "System"}
                    </p>
                  </div>
                </div>
                {row.metadata ? (
                  <div className="mt-3 rounded-md bg-muted/30 p-3 text-xs">
                    <p className="mb-1 font-medium">Context</p>
                    <div className="grid gap-1 md:grid-cols-2">
                      {Object.entries(row.metadata).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium">{key}:</span> {renderJsonValue(value, settings)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {row.before_state || row.after_state ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md bg-muted/20 p-3 text-xs">
                      <p className="mb-1 font-medium">Before</p>
                      {row.before_state ? (
                        Object.entries(row.before_state).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">{key}:</span> {renderJsonValue(value, settings)}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No previous state recorded.</p>
                      )}
                    </div>
                    <div className="rounded-md bg-muted/20 p-3 text-xs">
                      <p className="mb-1 font-medium">After</p>
                      {row.after_state ? (
                        Object.entries(row.after_state).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">{key}:</span> {renderJsonValue(value, settings)}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No new state recorded.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
