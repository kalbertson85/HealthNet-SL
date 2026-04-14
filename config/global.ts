export const APP_BRAND_NAME = "HealthNet HMS"
export const APP_TAGLINE = "Smarter Health Management for Stronger Care"

export const DEFAULT_GLOBAL_SETTINGS = {
  appName: APP_BRAND_NAME,
  hospitalName: APP_BRAND_NAME,
  country: "Global",
  currencyCode: "USD",
  locale: "en-US",
  timezone: "UTC",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "24h",
  language: "en",
  phoneCountryCode: "+1",
  stateLabel: "State / Province",
  cityLabel: "City",
  facilityLabel: "Facility",
  publicCoverageLabel: "Public coverage",
} as const

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "ar", label: "Arabic" },
] as const

export const DATE_FORMAT_OPTIONS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
] as const

export const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
] as const

export const COMMON_CURRENCY_OPTIONS = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "NGN", label: "NGN - Nigerian Naira" },
  { value: "KES", label: "KES - Kenyan Shilling" },
  { value: "GHS", label: "GHS - Ghanaian Cedi" },
  { value: "ZAR", label: "ZAR - South African Rand" },
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "SAR", label: "SAR - Saudi Riyal" },
] as const

export const COMMON_TIMEZONE_OPTIONS = [
  "UTC",
  "Africa/Accra",
  "Africa/Freetown",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
] as const
