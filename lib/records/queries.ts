import { createServerClient } from "@/lib/supabase/server"

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>

export interface PatientRow {
  id: string
  full_name: string | null
  patient_number: string | null
  date_of_birth: string | null
}

export interface VisitRow {
  patient_id: string
}

export interface RecordsVisitHandoffRow {
  id: string
  created_at: string
  visit_status: string
  diagnosis: string | null
  is_free_health_care: boolean | null
  payer_category: string | null
  patients?:
    | {
        id?: string | null
        full_name?: string | null
        patient_number?: string | null
        date_of_birth?: string | null
      }
    | Array<{
        id?: string | null
        full_name?: string | null
        patient_number?: string | null
        date_of_birth?: string | null
      }>
    | null
  facilities?:
    | {
        name?: string | null
        code?: string | null
      }
    | Array<{
        name?: string | null
        code?: string | null
      }>
    | null
}

function isLikelyPatientNumberSearch(searchQuery: string) {
  const normalized = searchQuery.trim()
  if (!normalized || normalized.includes(" ")) return false
  return /^pt[-\w]*$/i.test(normalized) || /^[a-z]{1,4}-?\d[\w-]*$/i.test(normalized) || /^\d{4,}$/.test(normalized)
}

function isExactPatientNumberSearch(searchQuery: string) {
  const normalized = searchQuery.trim()
  if (!normalized || normalized.includes(" ")) return false
  return /^pt-\d+$/i.test(normalized) || /^[a-z]{1,4}-\d[\w-]*$/i.test(normalized) || /^\d{6,}$/.test(normalized)
}

export async function searchRecordsPatients(
  supabase: SupabaseClient,
  searchQuery: string,
  currentPage: number,
  pageSize: number,
  isLikelyId: boolean,
) {
  const from = (currentPage - 1) * pageSize
  const to = from + pageSize
  const normalizedQuery = searchQuery.trim()
  const likelyPatientNumber = !isLikelyId && isLikelyPatientNumberSearch(normalizedQuery)
  const exactPatientNumber = !isLikelyId && isExactPatientNumberSearch(normalizedQuery)
  let query = supabase.from("patients").select("id, full_name, patient_number, date_of_birth")

  if (isLikelyId) {
    query = query.eq("id", normalizedQuery)
  } else if (exactPatientNumber) {
    query = query.ilike("patient_number", normalizedQuery)
  } else if (likelyPatientNumber) {
    query = query.ilike("patient_number", `%${normalizedQuery}%`)
  } else {
    query = query.or(`patient_number.ilike.%${normalizedQuery}%,full_name.ilike.%${normalizedQuery}%`)
  }

  const { data, error } = await query.order("created_at", { ascending: false }).range(from, to)

  if (error) {
    console.error("[records] Error searching patients:", error.message || error)
    return { patients: [] as PatientRow[], totalMatched: 0, hasNextPage: false }
  }

  const rows = (data || []) as PatientRow[]
  const hasNextPage = rows.length > pageSize
  const patients = rows.slice(0, pageSize)
  const totalMatched = from + patients.length + (hasNextPage ? 1 : 0)

  return { patients, totalMatched, hasNextPage }
}

export async function fetchTodaysVisitsByPatientIds(
  supabase: SupabaseClient,
  patientIds: string[],
) {
  const visitsByPatientId = new Map<string, VisitRow>()
  if (patientIds.length === 0) return visitsByPatientId

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { data: visits, error } = await supabase
    .from("visits")
    .select("patient_id")
    .in("patient_id", patientIds)
    .gte("created_at", startOfDay.toISOString())

  if (error) {
    console.error("[records] Error loading today visits for records:", error.message || error)
    return visitsByPatientId
  }

  for (const visit of (visits || []) as VisitRow[]) {
    if (!visitsByPatientId.has(visit.patient_id)) {
      visitsByPatientId.set(visit.patient_id, visit)
    }
  }

  return visitsByPatientId
}

export async function ensureTodayVisitForRecords(supabase: SupabaseClient, patientId: string) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { data: existingVisit, error: existingError } = await supabase
    .from("visits")
    .select("id")
    .eq("patient_id", patientId)
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingError && existingError.code !== "PGRST116") {
    console.error("[records] Error checking existing visit from records:", existingError.message || existingError)
    return { ok: false as const, reason: "lookup_failed" }
  }

  if (existingVisit) {
    return { ok: true as const, created: false, visitId: existingVisit.id as string }
  }

  const [{ data: patientRow }, { data: opdFacility }] = await Promise.all([
    supabase.from("patients").select("id, company_id, free_health_category").eq("id", patientId).maybeSingle(),
    supabase.from("facilities").select("id").eq("code", "opd").maybeSingle(),
  ])

  const companyAwarePatient = (patientRow || null) as {
    company_id?: string | null
    free_health_category?: string | null
    id?: string | null
  } | null

  const companyId = companyAwarePatient?.company_id ?? null
  const freeHealthCategory = companyAwarePatient?.free_health_category ?? "none"
  const isFreeHealthCare = freeHealthCategory !== "none"
  const payerCategory = isFreeHealthCare ? "fhc" : companyId ? "company" : "self_pay"

  const facilityId = (opdFacility?.id as string | null) ?? null

  const { data: insertedVisit, error: insertError } = await supabase
    .from("visits")
    .insert({
      patient_id: patientId,
      visit_status: "doctor_pending",
      assigned_company_id: companyId,
      is_free_health_care: isFreeHealthCare,
      payer_category: payerCategory,
      facility_id: facilityId,
    })
    .select("id")
    .maybeSingle()

  if (insertError || !insertedVisit?.id) {
    console.error("[records] Error creating visit from records:", insertError?.message || insertError || "visit id missing")
    return { ok: false as const, reason: "insert_failed" }
  }

  return { ok: true as const, created: true, visitId: insertedVisit.id as string }
}

export async function fetchRecordsVisitHandoff(supabase: SupabaseClient, visitId: string) {
  const { data, error } = await supabase
    .from("visits")
    .select(
      `id, created_at, visit_status, diagnosis, is_free_health_care, payer_category,
       patients(id, full_name, patient_number, date_of_birth),
       facilities(name, code)`,
    )
    .eq("id", visitId)
    .maybeSingle()

  if (error) {
    console.error("[records] Error loading visit handoff:", error.message || error)
    return { visit: null as RecordsVisitHandoffRow | null, admissionId: null as string | null }
  }

  const visit = (data || null) as RecordsVisitHandoffRow | null
  if (!visit) {
    return { visit: null as RecordsVisitHandoffRow | null, admissionId: null as string | null }
  }

  let admissionId: string | null = null

  if (visit.visit_status === "admitted") {
    const { data: admissionRow, error: admissionError } = await supabase
      .from("admissions")
      .select("id")
      .eq("visit_id", visit.id)
      .in("status", ["admitted", "discharged"])
      .order("admission_date", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (admissionError) {
      console.error("[records] Error resolving admission for handoff:", admissionError.message || admissionError)
    }

    admissionId = (admissionRow?.id as string | null) ?? null
  }

  return { visit, admissionId }
}
