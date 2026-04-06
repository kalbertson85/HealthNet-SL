import { createServerClient } from "@/lib/supabase/server"

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>

export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  ids: string[],
) {
  if (ids.length === 0) return []
  const { data } = await supabase.from("profiles").select("id, full_name, email, role").in("id", ids)
  return data || []
}

export async function fetchInvoicesWithPatientsByIds(
  supabase: SupabaseClient,
  invoiceIds: string[],
) {
  if (invoiceIds.length === 0) return []
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, patient_id, patients(full_name, patient_number)")
    .in("id", invoiceIds)
  return data || []
}

export async function fetchLatestLabAuditActivity(
  supabase: SupabaseClient,
  testIds: string[],
) {
  if (testIds.length === 0) return []
  const { data } = await supabase
    .from("lab_audit_logs")
    .select("lab_test_id, action, created_at")
    .in("lab_test_id", testIds)
    .order("created_at", { ascending: false })
  return data || []
}
