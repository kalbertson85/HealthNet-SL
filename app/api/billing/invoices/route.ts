import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { apiError, enforceFixedWindowRateLimit } from "@/lib/http/api"
import { enforceTrustedOrigin } from "@/lib/http/request-security"
import { requirePermission, toAuthErrorResponse } from "@/lib/supabase/middleware"
import { ensureActiveVisitForPatient } from "@/lib/visit-flow"
import { doesVisitBelongToPatient, isCrossFacilityAccessDenied, isVisitTerminal } from "@/lib/workflow-integrity"
import { ROLES } from "@/lib/utils"

const createInvoiceSchema = z.object({
  patient_number: z.string().trim().min(1).max(64),
  visit_id: z.string().trim().uuid().optional(),
  notes: z.string().trim().max(5000).optional(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(255),
        quantity: z.number().finite().int().positive(),
        unit_price: z.number().finite().nonnegative(),
      }),
    )
    .min(1)
    .max(200),
})

const MAX_INVOICE_REQUEST_BODY_BYTES = 256 * 1024

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function hasDuplicateInvoiceLines(items: Array<{ description: string; unit_price: number }>) {
  const seen = new Set<string>()
  for (const item of items) {
    const key = `${normalizeText(item.description)}|${item.unit_price}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

function generateInvoiceNumber() {
  return `INV-${Date.now().toString().slice(-6)}`
}

export async function POST(request: NextRequest) {
  const limited = enforceFixedWindowRateLimit(request, {
    key: "api_billing_invoices_create",
    maxRequests: 90,
    windowMs: 60_000,
  })
  if (limited) return limited

  const originGuard = enforceTrustedOrigin(request)
  if (originGuard) return originGuard

  try {
    const { supabase, user } = await requirePermission(request, "billing.manage")
    if (!user?.id) {
      return apiError(401, "unauthorized", "Unauthorized", request)
    }
    const contentType = request.headers.get("content-type")?.toLowerCase() || ""
    if (!contentType.includes("application/json")) {
      return apiError(415, "unsupported_media_type", "Content-Type must be application/json", request)
    }
    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_INVOICE_REQUEST_BODY_BYTES) {
      return apiError(413, "payload_too_large", "Request payload too large", request)
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return apiError(400, "invalid_json", "Invalid JSON payload", request)
    }

    const parsed = createInvoiceSchema.safeParse(payload)
    if (!parsed.success) {
      return apiError(400, "invalid_payload", "Invalid invoice payload", request)
    }

    const { patient_number, visit_id, notes, items } = parsed.data
    if (hasDuplicateInvoiceLines(items)) {
      return apiError(409, "duplicate_invoice_lines", "Duplicate invoice line items are not allowed", request)
    }
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, facility_id")
      .eq("patient_number", patient_number)
      .maybeSingle()

    if (patientError) {
      return apiError(500, "patient_lookup_failed", "Failed to resolve patient", request)
    }
    if (!patient?.id) {
      return apiError(404, "patient_not_found", "No patient found with that patient number", request)
    }

    const userFacilityId = user?.facility_id ?? null
    const patientFacilityId = (patient as { facility_id?: string | null }).facility_id ?? null
    const userRole = (user?.role || "").toLowerCase()

    if (userRole !== ROLES.ADMIN && userFacilityId && patientFacilityId && userFacilityId !== patientFacilityId) {
      return apiError(403, "patient_facility_mismatch", "Forbidden: patient belongs to another facility", request)
    }

    let visitId = visit_id?.trim() || null
    if (visitId) {
      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .select("id, patient_id, facility_id, visit_status")
        .eq("id", visitId)
        .maybeSingle()

      if (visitError) {
        return apiError(500, "visit_lookup_failed", "Failed to validate visit", request)
      }
      if (!visit?.id) {
        return apiError(404, "visit_not_found", "Visit not found", request)
      }
      if (!doesVisitBelongToPatient({ visitPatientId: visit.patient_id as string | null, patientId: patient.id })) {
        return apiError(409, "visit_patient_mismatch", "Visit does not belong to this patient", request)
      }
      if (isVisitTerminal(visit.visit_status as string | null)) {
        return apiError(409, "visit_closed", "Cannot create invoice on a closed visit", request)
      }
      const visitFacilityId = (visit.facility_id as string | null) ?? null
      if (isCrossFacilityAccessDenied({ userRole, userFacilityId, resourceFacilityId: visitFacilityId })) {
        return apiError(403, "visit_facility_mismatch", "Forbidden: visit belongs to another facility", request)
      }
    } else {
      visitId = await ensureActiveVisitForPatient(supabase, patient.id, {
        facilityId: userFacilityId || patientFacilityId || null,
        facilityCode: userFacilityId || patientFacilityId ? null : "opd",
        status: "billing_pending",
      })
      if (!visitId) {
        return apiError(409, "visit_creation_failed", "Unable to create or locate an active visit for this patient", request)
      }
    }

    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

    const { data: existingInvoices, error: existingInvoicesError } = await supabase
      .from("invoices")
      .select("id, total_amount, paid_amount")
      .eq("visit_id", visitId)
      .order("created_at", { ascending: false })
      .limit(10)

    if (existingInvoicesError) {
      return apiError(500, "invoice_lookup_failed", "Failed to validate existing invoices", request)
    }

    const hasOpenInvoice = ((existingInvoices || []) as Array<{ total_amount?: number | null; paid_amount?: number | null }>).some((row) => {
      const total = Number(row.total_amount ?? 0)
      const paid = Number(row.paid_amount ?? 0)
      return total - paid > 0
    })
    if (hasOpenInvoice) {
      return apiError(409, "duplicate_open_invoice", "An open invoice already exists for this visit", request)
    }

    const rpcFn = (supabase as { rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc
    if (typeof rpcFn !== "function") {
      return apiError(503, "transactional_dependency_unavailable", "Transactional invoice RPC is unavailable", request)
    }
    const rpcResult = await rpcFn("create_invoice_transactional", {
      p_patient_id: patient.id,
      p_visit_id: visitId,
      p_created_by: user.id,
      p_total_amount: totalAmount,
      p_items: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.quantity * item.unit_price,
      })),
      p_notes: notes || null,
      p_invoice_number: generateInvoiceNumber(),
    })

    if (rpcResult.error) {
      const rpcErrorCode = String((rpcResult.error as { code?: string } | null)?.code || "")
      if (rpcErrorCode === "23505") {
        return apiError(409, "duplicate_open_invoice", "An open invoice already exists for this visit", request)
      }
      if (rpcErrorCode === "42883") {
        return apiError(503, "transactional_dependency_unavailable", "Transactional invoice RPC is unavailable", request)
      }
      return apiError(500, "invoice_create_failed", "Failed to create invoice", request)
    }
    const rpcData = (rpcResult.data || null) as
      | { ok?: boolean; code?: string; message?: string; invoice_id?: string | null }
      | null
      | undefined
    if (rpcData?.ok && rpcData.invoice_id) {
      return NextResponse.json({ ok: true, invoice_id: rpcData.invoice_id }, { status: 200 })
    }
    if (rpcData && rpcData.ok === false) {
      if (rpcData.code === "duplicate_open_invoice") {
        return apiError(409, "duplicate_open_invoice", "An open invoice already exists for this visit", request)
      }
      return apiError(500, rpcData.code || "invoice_create_failed", rpcData.message || "Failed to create invoice", request)
    }
    return apiError(500, "invoice_create_failed", "Failed to create invoice", request)
  } catch (error) {
    const authError = toAuthErrorResponse(error, request)
    if (authError) return authError
    console.error("[v0] Failed to create invoice from API", error)
    return apiError(500, "invoice_create_failed", "Failed to create invoice", request)
  }
}
