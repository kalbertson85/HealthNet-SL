import { cache } from "react"
import { createServerClient } from "@/lib/supabase/server"
import { normalizeGlobalSettings, type GlobalSettings, type GlobalSettingsInput } from "@/lib/locale-format"

const GLOBAL_SETTINGS_SELECT = [
  "hospital_name",
  "billing_logo_url",
  "address",
  "address_line_1",
  "address_line_2",
  "city",
  "state_or_province",
  "postal_code",
  "country",
  "phone",
  "phone_country_code",
  "email",
  "currency_code",
  "locale",
  "timezone",
  "date_format",
  "time_format",
  "language",
  "state_label",
  "city_label",
  "facility_label",
  "public_coverage_label",
].join(", ")

export { GLOBAL_SETTINGS_SELECT }
export type { GlobalSettings, GlobalSettingsInput }
export { normalizeGlobalSettings }

export const getGlobalSettings = cache(async (): Promise<GlobalSettings> => {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from("hospital_settings")
    .select(GLOBAL_SETTINGS_SELECT)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<GlobalSettingsInput>()

  return normalizeGlobalSettings(data)
})
