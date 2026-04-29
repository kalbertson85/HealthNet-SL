import { describe, expect, it } from "vitest"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type LiveRlsUserCase = {
  label: string
  email: string
  password: string
  primaryFacilityExpected: boolean
  secondaryFacilityExpected: boolean
  expectedFacilityId?: string | null
}

const LIVE_ENABLED = process.env.LIVE_RLS_TESTS_ENABLED === "true"
const describeLive = LIVE_ENABLED ? describe : describe.skip

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

function parseUserCases(): LiveRlsUserCase[] {
  const raw = requireEnv("LIVE_RLS_USER_CASES_JSON")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("LIVE_RLS_USER_CASES_JSON must be a non-empty JSON array")
  }
  return parsed as LiveRlsUserCase[]
}

function buildAnonClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function buildServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

describeLive("live supabase rls integration", () => {
  it(
    "enforces auth boundary and facility access matrix via RLS helper RPCs",
    async () => {
      const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
      const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
      const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
      const primaryFacilityId = requireEnv("LIVE_RLS_PRIMARY_FACILITY_ID")
      const secondaryFacilityId = requireEnv("LIVE_RLS_SECONDARY_FACILITY_ID")
      const userCases = parseUserCases()

      const anonClient = buildAnonClient(url, anonKey)
      const serviceClient = buildServiceClient(url, serviceRoleKey)

      // Baseline: anon should not execute authenticated-only helper RPC.
      const anonCall = await anonClient.rpc("can_access_facility", { p_facility_id: primaryFacilityId })
      expect(anonCall.error).toBeTruthy()

      // service-role should always be callable for setup/verification paths.
      const serviceCall = await serviceClient.rpc("can_access_facility", { p_facility_id: primaryFacilityId })
      expect(serviceCall.error).toBeNull()

      for (const userCase of userCases) {
        const client = buildAnonClient(url, anonKey)
        const signIn = await client.auth.signInWithPassword({
          email: userCase.email,
          password: userCase.password,
        })
        expect(signIn.error, `${userCase.label}: login should succeed`).toBeNull()
        expect(signIn.data.session, `${userCase.label}: missing session`).toBeTruthy()

        const primary = await client.rpc("can_access_facility", { p_facility_id: primaryFacilityId })
        expect(primary.error, `${userCase.label}: primary facility rpc error`).toBeNull()
        expect(Boolean(primary.data), `${userCase.label}: primary facility access mismatch`).toBe(userCase.primaryFacilityExpected)

        const secondary = await client.rpc("can_access_facility", { p_facility_id: secondaryFacilityId })
        expect(secondary.error, `${userCase.label}: secondary facility rpc error`).toBeNull()
        expect(Boolean(secondary.data), `${userCase.label}: secondary facility access mismatch`).toBe(
          userCase.secondaryFacilityExpected,
        )

        if (Object.prototype.hasOwnProperty.call(userCase, "expectedFacilityId")) {
          const facility = await client.rpc("current_user_facility_id")
          expect(facility.error, `${userCase.label}: current_user_facility_id rpc error`).toBeNull()
          expect(facility.data ?? null, `${userCase.label}: facility id mismatch`).toBe(userCase.expectedFacilityId ?? null)
        }

        await client.auth.signOut()
      }
    },
    60_000,
  )
})

