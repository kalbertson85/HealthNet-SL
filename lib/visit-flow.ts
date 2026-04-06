type SupabaseLike = {
  from: (table: string) => unknown
  rpc: (fn: string, args?: Record<string, unknown>) => unknown
}

export async function resolveFacilityIdByCode(supabase: SupabaseLike, code: string): Promise<string | null> {
  const facilitiesQuery = supabase.from("facilities") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { id?: string | null } | null }>
      }
    }
  }
  const { data } = await facilitiesQuery.select("id").eq("code", code).maybeSingle()
  return (data?.id as string | null) ?? null
}

export async function ensureActiveVisitForPatient(
  supabase: SupabaseLike,
  patientId: string,
  opts?: { facilityCode?: string | null; status?: string },
): Promise<string | null> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const visitsQuery = supabase.from("visits") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        gte: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => {
              maybeSingle: () => Promise<{ data: { id?: string | null } | null }>
            }
          }
        }
      }
    }
    insert: (payload: Record<string, unknown>) => {
      select: (query: string) => {
        maybeSingle: () => Promise<{ data: { id?: string | null } | null; error?: { message?: string } | null }>
      }
    }
  }

  const patientsQuery = supabase.from("patients") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { company_id?: string | null; free_health_category?: string | null } | null }>
      }
    }
  }

  const { data: existingVisit } = await visitsQuery
    .select("id")
    .eq("patient_id", patientId)
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingVisit?.id) {
    return existingVisit.id as string
  }

  const { data: patient } = await patientsQuery
    .select("company_id, free_health_category")
    .eq("id", patientId)
    .maybeSingle()

  const companyId = (patient?.company_id as string | null) ?? null
  const freeHealthCategory = (patient?.free_health_category as string | null) ?? "none"
  const isFreeHealthCare = freeHealthCategory !== "none"
  const payerCategory = isFreeHealthCare ? "fhc" : companyId ? "company" : "self_pay"
  const facilityCode = opts?.facilityCode ?? "opd"
  const facilityId = facilityCode ? await resolveFacilityIdByCode(supabase, facilityCode) : null

  const { data: inserted, error } = await visitsQuery
    .insert({
      patient_id: patientId,
      visit_status: opts?.status || "doctor_pending",
      assigned_company_id: companyId,
      is_free_health_care: isFreeHealthCare,
      payer_category: payerCategory,
      facility_id: facilityId,
    })
    .select("id")
    .maybeSingle()

  if (error || !inserted?.id) {
    console.error("[visit-flow] Failed to ensure active visit:", error?.message || error)
    return null
  }

  return inserted.id as string
}

export async function ensureQueueEntryForVisit(
  supabase: SupabaseLike,
  {
    patientId,
    visitId,
    department,
    priority,
    notes,
  }: {
    patientId: string
    visitId: string
    department: string
    priority: "normal" | "urgent" | "emergency"
    notes?: string | null
  },
): Promise<void> {
  const queuesQuery = supabase.from("queues") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => {
            limit: (count: number) => {
              maybeSingle: () => Promise<{ data: { id?: string | null } | null }>
            }
          }
        }
      }
    }
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<unknown>
    }
    insert: (payload: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>
  }

  const { data: existingQueue } = await queuesQuery
    .select("id")
    .eq("visit_id", visitId)
    .eq("department", department)
    .in("status", ["waiting", "in_progress"])
    .limit(1)
    .maybeSingle()

  if (existingQueue?.id) {
    await queuesQuery
      .update({
        priority,
        notes: notes || null,
      })
      .eq("id", existingQueue.id as string)
    return
  }

  const queueNumberRpc = supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown
    error: { message?: string } | null
  }>

  const { data: queueNumberResult, error: queueNumberError } = await queueNumberRpc("generate_queue_number", {
    dept: department,
  })

  if (queueNumberError) {
    console.error("[visit-flow] Failed to generate queue number:", queueNumberError.message || queueNumberError)
  }

  const queueNumber = (queueNumberResult as string | null) ?? `${department.slice(0, 3).toUpperCase()}-000`

  const { error: insertError } = await queuesQuery.insert({
    patient_id: patientId,
    visit_id: visitId,
    department,
    queue_number: queueNumber,
    priority,
    status: "waiting",
    notes: notes || null,
  })

  if (insertError) {
    console.error("[visit-flow] Failed to create queue entry:", insertError.message || insertError)
  }
}

export async function advanceVisitToDoctorReviewIfDiagnosticsComplete(
  supabase: SupabaseLike,
  visitId: string,
): Promise<void> {
  const visitsQuery = supabase.from("visits") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { visit_status?: string | null } | null; error?: { message?: string } | null }>
      }
    }
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error?: { message?: string } | null }>
    }
  }

  const listQuery = supabase.from as (table: string) => {
    select: (query: string) => {
      eq: (column: string, value: string) => Promise<{ data: Array<{ status?: string | null }> | null; error?: { message?: string } | null }>
    }
  }

  const { data: visit, error: visitError } = await visitsQuery.select("visit_status").eq("id", visitId).maybeSingle()
  if (visitError || !visit?.visit_status) {
    console.error("[visit-flow] Failed to load visit before diagnostics completion check:", visitError?.message || visitError)
    return
  }

  if (visit.visit_status !== "lab_pending") {
    return
  }

  const [{ data: investigations, error: invError }, { data: labTests, error: labError }, { data: radiology, error: radError }] =
    await Promise.all([
      listQuery("investigations").select("status").eq("visit_id", visitId),
      listQuery("lab_tests").select("status").eq("visit_id", visitId),
      listQuery("radiology_requests").select("status").eq("visit_id", visitId),
    ])

  if (invError || labError || radError) {
    console.error("[visit-flow] Failed to check remaining diagnostics:", invError?.message || labError?.message || radError?.message)
    return
  }

  const hasOutstanding = (rows: Array<{ status?: string | null }> | null | undefined) =>
    (rows || []).some((row) => {
      const status = (row.status || "").toLowerCase()
      return status !== "completed" && status !== "cancelled"
    })

  if (hasOutstanding(investigations) || hasOutstanding(labTests) || hasOutstanding(radiology)) {
    return
  }

  const { error: updateError } = await visitsQuery.update({ visit_status: "doctor_review" }).eq("id", visitId)
  if (updateError) {
    console.error("[visit-flow] Failed to advance visit to doctor_review:", updateError.message || updateError)
  }
}

export async function findAdmissionIdByVisitId(supabase: SupabaseLike, visitId: string): Promise<string | null> {
  const admissionsQuery = supabase.from("admissions") as {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        in: (column: string, values: string[]) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => {
              maybeSingle: () => Promise<{ data: { id?: string | null } | null }>
            }
          }
        }
      }
    }
  }

  const { data } = await admissionsQuery
    .select("id")
    .eq("visit_id", visitId)
    .in("status", ["admitted", "discharged"])
    .order("admission_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.id as string | null) ?? null
}
