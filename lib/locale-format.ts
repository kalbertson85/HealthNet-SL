import { DEFAULT_GLOBAL_SETTINGS } from "@/config/global"

export type DateFormatPreference = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
export type TimeFormatPreference = "12h" | "24h"

export type GlobalSettings = {
  appName: string
  hospitalName: string
  country: string
  currencyCode: string
  locale: string
  timezone: string
  dateFormat: DateFormatPreference
  timeFormat: TimeFormatPreference
  language: string
  phoneCountryCode: string
  stateLabel: string
  cityLabel: string
  facilityLabel: string
  publicCoverageLabel: string
  address: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  stateOrProvince: string | null
  postalCode: string | null
  billingLogoUrl: string | null
  phone: string | null
  email: string | null
}

export type GlobalSettingsInput = Partial<{
  hospital_name: string | null
  billing_logo_url: string | null
  address: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  state_or_province: string | null
  postal_code: string | null
  country: string | null
  phone: string | null
  phone_country_code: string | null
  email: string | null
  currency_code: string | null
  locale: string | null
  timezone: string | null
  date_format: DateFormatPreference | null
  time_format: TimeFormatPreference | null
  language: string | null
  state_label: string | null
  city_label: string | null
  facility_label: string | null
  public_coverage_label: string | null
}> | null

export function normalizeGlobalSettings(input?: GlobalSettingsInput): GlobalSettings {
  return {
    appName: DEFAULT_GLOBAL_SETTINGS.appName,
    hospitalName: input?.hospital_name?.trim() || DEFAULT_GLOBAL_SETTINGS.hospitalName,
    country: input?.country?.trim() || DEFAULT_GLOBAL_SETTINGS.country,
    currencyCode: input?.currency_code?.trim().toUpperCase() || DEFAULT_GLOBAL_SETTINGS.currencyCode,
    locale: input?.locale?.trim() || DEFAULT_GLOBAL_SETTINGS.locale,
    timezone: input?.timezone?.trim() || DEFAULT_GLOBAL_SETTINGS.timezone,
    dateFormat: input?.date_format || DEFAULT_GLOBAL_SETTINGS.dateFormat,
    timeFormat: input?.time_format || DEFAULT_GLOBAL_SETTINGS.timeFormat,
    language: input?.language?.trim() || DEFAULT_GLOBAL_SETTINGS.language,
    phoneCountryCode: input?.phone_country_code?.trim() || DEFAULT_GLOBAL_SETTINGS.phoneCountryCode,
    stateLabel: input?.state_label?.trim() || DEFAULT_GLOBAL_SETTINGS.stateLabel,
    cityLabel: input?.city_label?.trim() || DEFAULT_GLOBAL_SETTINGS.cityLabel,
    facilityLabel: input?.facility_label?.trim() || DEFAULT_GLOBAL_SETTINGS.facilityLabel,
    publicCoverageLabel:
      input?.public_coverage_label?.trim() || DEFAULT_GLOBAL_SETTINGS.publicCoverageLabel,
    address: input?.address?.trim() || null,
    addressLine1: input?.address_line_1?.trim() || null,
    addressLine2: input?.address_line_2?.trim() || null,
    city: input?.city?.trim() || null,
    stateOrProvince: input?.state_or_province?.trim() || null,
    postalCode: input?.postal_code?.trim() || null,
    billingLogoUrl: input?.billing_logo_url?.trim() || null,
    phone: input?.phone?.trim() || null,
    email: input?.email?.trim() || null,
  }
}

function getHour12(timeFormat: TimeFormatPreference) {
  return timeFormat === "12h"
}

function safeDate(value?: string | Date | null) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatNumber(value: number, settings?: GlobalSettingsInput, options?: Intl.NumberFormatOptions) {
  const normalized = normalizeGlobalSettings(settings)
  return new Intl.NumberFormat(normalized.locale, options).format(value)
}

export function formatCurrency(value: number, settings?: GlobalSettingsInput, options?: Intl.NumberFormatOptions) {
  const normalized = normalizeGlobalSettings(settings)
  return new Intl.NumberFormat(normalized.locale, {
    style: "currency",
    currency: normalized.currencyCode,
    maximumFractionDigits: 0,
    ...options,
  }).format(value)
}

function formatNumericDate(date: Date, normalized: GlobalSettings) {
  const formatter = new Intl.DateTimeFormat(normalized.locale, {
    timeZone: normalized.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const day = values.get("day") || "--"
  const month = values.get("month") || "--"
  const year = values.get("year") || "----"

  switch (normalized.dateFormat) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`
    case "DD/MM/YYYY":
    default:
      return `${day}/${month}/${year}`
  }
}

export function formatDate(
  value: string | Date | null | undefined,
  settings?: GlobalSettingsInput,
  options?: { style?: "numeric" | "medium" | "long" },
) {
  const date = safeDate(value)
  if (!date) return "-"
  const normalized = normalizeGlobalSettings(settings)
  const style = options?.style || "medium"

  if (style === "numeric") {
    return formatNumericDate(date, normalized)
  }

  return new Intl.DateTimeFormat(normalized.locale, {
    timeZone: normalized.timezone,
    day: "2-digit",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  }).format(date)
}

export function formatDateTime(value: string | Date | null | undefined, settings?: GlobalSettingsInput) {
  const date = safeDate(value)
  if (!date) return "-"
  const normalized = normalizeGlobalSettings(settings)
  return new Intl.DateTimeFormat(normalized.locale, {
    timeZone: normalized.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: getHour12(normalized.timeFormat),
  }).format(date)
}

export function formatTime(value: string | Date | null | undefined, settings?: GlobalSettingsInput) {
  const date = safeDate(value)
  if (!date) return "-"
  const normalized = normalizeGlobalSettings(settings)
  return new Intl.DateTimeFormat(normalized.locale, {
    timeZone: normalized.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: getHour12(normalized.timeFormat),
  }).format(date)
}

export function formatFacilityAddress(settings?: GlobalSettingsInput) {
  const normalized = normalizeGlobalSettings(settings)
  const parts = [
    normalized.addressLine1,
    normalized.addressLine2,
    normalized.city,
    normalized.stateOrProvince,
    normalized.postalCode,
    normalized.country,
  ].filter(Boolean)

  if (parts.length > 0) return parts.join(", ")
  return normalized.address || ""
}

export function getPublicCoverageLabel(settings?: GlobalSettingsInput) {
  return normalizeGlobalSettings(settings).publicCoverageLabel
}
