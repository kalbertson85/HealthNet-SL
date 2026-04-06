export type CompanyCoverageRow = {
  patientId: string
  beneficiaryName: string | null
  relationshipLabel: string
  principalEmployeeName: string | null
  principalEmployeeId: string | null
  companyLinked: boolean
}

type SupabaseLike = {
  from: (table: string) => {
    select: (query: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        in: (column: string, values: string[]) => Promise<{ data: unknown[] | null }>
      }
      in: (column: string, values: string[]) => Promise<{ data: unknown[] | null }>
    }
  }
}

function titleCase(value: string | null | undefined) {
  if (!value) return null
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

export async function fetchCompanyCoverageMap(
  supabase: unknown,
  companyId: string | null,
  patientIds: string[],
) {
  const coverageByPatientId = new Map<string, CompanyCoverageRow>()
  const db = supabase as SupabaseLike

  if (!companyId || patientIds.length === 0) {
    return coverageByPatientId
  }

  const [{ data: employeesRaw }, { data: dependentsRaw }] = await Promise.all([
    db
      .from("company_employees")
      .select("id, patient_id, full_name, company_id")
      .eq("company_id", companyId)
      .in("patient_id", patientIds),
    db
      .from("employee_dependents")
      .select("patient_id, employee_id, full_name, relationship")
      .in("patient_id", patientIds),
  ])

  const employees = (employeesRaw || []) as Array<{
    id?: string | null
    patient_id?: string | null
    full_name?: string | null
    company_id?: string | null
  }>

  const dependents = (dependentsRaw || []) as Array<{
    patient_id?: string | null
    employee_id?: string | null
    full_name?: string | null
    relationship?: string | null
  }>

  const employeesById = new Map<string, { full_name?: string | null }>()
  for (const employee of employees) {
    if (!employee.id) continue
    employeesById.set(employee.id, { full_name: employee.full_name ?? null })
  }

  for (const employee of employees) {
    if (!employee.patient_id) continue
    coverageByPatientId.set(employee.patient_id, {
      patientId: employee.patient_id,
      beneficiaryName: employee.full_name ?? null,
      relationshipLabel: "Employee",
      principalEmployeeName: employee.full_name ?? null,
      principalEmployeeId: employee.id ?? null,
      companyLinked: true,
    })
  }

  for (const dependent of dependents) {
    if (!dependent.patient_id) continue
    const principal = dependent.employee_id ? employeesById.get(dependent.employee_id) : null
    coverageByPatientId.set(dependent.patient_id, {
      patientId: dependent.patient_id,
      beneficiaryName: dependent.full_name ?? null,
      relationshipLabel: titleCase(dependent.relationship) || "Dependent",
      principalEmployeeName: principal?.full_name ?? null,
      principalEmployeeId: dependent.employee_id ?? null,
      companyLinked: true,
    })
  }

  return coverageByPatientId
}
