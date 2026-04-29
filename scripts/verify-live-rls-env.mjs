const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LIVE_RLS_PRIMARY_FACILITY_ID",
  "LIVE_RLS_SECONDARY_FACILITY_ID",
  "LIVE_RLS_USER_CASES_JSON",
]

const missing = required.filter((name) => !process.env[name] || String(process.env[name]).trim().length === 0)

if (missing.length > 0) {
  console.error("Missing required live RLS env vars:")
  for (const name of missing) console.error(`- ${name}`)
  process.exit(1)
}

try {
  JSON.parse(process.env.LIVE_RLS_USER_CASES_JSON)
} catch {
  console.error("LIVE_RLS_USER_CASES_JSON must be valid JSON")
  process.exit(1)
}

if (process.env.LIVE_RLS_TABLE_PROBES_JSON) {
  try {
    JSON.parse(process.env.LIVE_RLS_TABLE_PROBES_JSON)
  } catch {
    console.error("LIVE_RLS_TABLE_PROBES_JSON must be valid JSON when provided")
    process.exit(1)
  }
}

console.log("Live RLS env precheck passed")
