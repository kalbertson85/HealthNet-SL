"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { COMMON_CURRENCY_OPTIONS, COMMON_TIMEZONE_OPTIONS, DATE_FORMAT_OPTIONS, LANGUAGE_OPTIONS, TIME_FORMAT_OPTIONS } from "@/config/global"
import {
  CITY_LABEL_OPTIONS,
  COUNTRY_OPTIONS,
  COUNTRY_PRESETS,
  REGION_LABEL_OPTIONS,
  getCountryPreset,
} from "@/config/country-presets"
import { createTranslator } from "@/lib/i18n"
import type { GlobalSettings } from "@/lib/locale-format"

type BrandingAction = (formData: FormData) => void | Promise<void>

type BrandingFormState = {
  hospitalName: string
  facilityLabel: string
  phone: string
  email: string
  addressLine1: string
  addressLine2: string
  city: string
  stateOrProvince: string
  postalCode: string
  country: string
  stateLabel: string
  cityLabel: string
  phoneCountryCode: string
  currencyCode: string
  locale: string
  language: string
  timezone: string
  dateFormat: string
  timeFormat: string
  publicCoverageLabel: string
  billingLogoUrl: string
}

interface HospitalBrandingFormProps {
  action: BrandingAction
  initialSettings: GlobalSettings
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function getInitialState(settings: GlobalSettings): BrandingFormState {
  return {
    hospitalName: settings.hospitalName,
    facilityLabel: settings.facilityLabel,
    phone: settings.phone || settings.phoneCountryCode || "",
    email: settings.email || "",
    addressLine1: settings.addressLine1 || "",
    addressLine2: settings.addressLine2 || "",
    city: settings.city || "",
    stateOrProvince: settings.stateOrProvince || "",
    postalCode: settings.postalCode || "",
    country: settings.country,
    stateLabel: settings.stateLabel,
    cityLabel: settings.cityLabel,
    phoneCountryCode: settings.phoneCountryCode,
    currencyCode: settings.currencyCode,
    locale: settings.locale,
    language: settings.language,
    timezone: settings.timezone,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    publicCoverageLabel: settings.publicCoverageLabel,
    billingLogoUrl: settings.billingLogoUrl || "",
  }
}

export function HospitalBrandingForm({ action, initialSettings }: HospitalBrandingFormProps) {
  const [form, setForm] = useState<BrandingFormState>(() => getInitialState(initialSettings))
  const t = createTranslator(form.language)
  const selectedPreset = useMemo(() => getCountryPreset(form.country), [form.country])
  const countryOptions = useMemo(
    () => uniqueOptions([...COUNTRY_OPTIONS, initialSettings.country]),
    [initialSettings.country],
  )
  const localeOptions = useMemo(
    () => uniqueOptions([...COUNTRY_PRESETS.map((preset) => preset.locale), "en-US", "en-GB", "fr-FR", "ar-AE", form.locale]),
    [form.locale],
  )
  const phoneCodeOptions = useMemo(
    () => uniqueOptions([...COUNTRY_PRESETS.map((preset) => preset.phoneCountryCode), "+1", form.phoneCountryCode]),
    [form.phoneCountryCode],
  )
  const timezoneOptions = useMemo(
    () => uniqueOptions([...COMMON_TIMEZONE_OPTIONS, ...COUNTRY_PRESETS.map((preset) => preset.timezone), form.timezone]),
    [form.timezone],
  )
  const regionLabelOptions = useMemo(
    () => uniqueOptions([...REGION_LABEL_OPTIONS, form.stateLabel]),
    [form.stateLabel],
  )
  const cityLabelOptions = useMemo(
    () => uniqueOptions([...CITY_LABEL_OPTIONS, form.cityLabel]),
    [form.cityLabel],
  )
  const currencyOptions = useMemo(() => {
    const commonMap = new Map<string, string>(COMMON_CURRENCY_OPTIONS.map((option) => [option.value, option.label]))
    return uniqueOptions([
      ...COMMON_CURRENCY_OPTIONS.map((option) => option.value),
      ...COUNTRY_PRESETS.map((preset) => preset.currencyCode),
      form.currencyCode,
    ]).map((value) => ({
      value,
      label: commonMap.get(value) || `${value} - ${value}`,
    }))
  }, [form.currencyCode])

  const applyPhonePrefix = (currentPhone: string, previousCode: string, nextCode: string) => {
    const trimmed = currentPhone.trim()
    if (!trimmed) return nextCode
    if (trimmed === previousCode) return nextCode
    if (trimmed.startsWith(previousCode)) {
      return `${nextCode}${trimmed.slice(previousCode.length)}`
    }
    return currentPhone
  }

  const applyCountryPreset = (country: string) => {
    const preset = getCountryPreset(country)
    if (!preset) {
      setForm((prev) => ({ ...prev, country }))
      return
    }

    setForm((prev) => ({
      ...prev,
      country,
      stateLabel: preset.stateLabel,
      cityLabel: preset.cityLabel,
      phoneCountryCode: preset.phoneCountryCode,
      phone: applyPhonePrefix(prev.phone, prev.phoneCountryCode, preset.phoneCountryCode),
      currencyCode: preset.currencyCode,
      locale: preset.locale,
      language: preset.language,
      timezone: preset.timezone,
    }))
  }

  const updateField = (field: keyof BrandingFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const updatePhoneCode = (nextCode: string) => {
    setForm((prev) => ({
      ...prev,
      phoneCountryCode: nextCode,
      phone: applyPhonePrefix(prev.phone, prev.phoneCountryCode, nextCode),
    }))
  }

  const formattedAddress = [
    form.addressLine1.trim(),
    form.addressLine2.trim(),
    form.city.trim(),
    form.stateOrProvince.trim(),
    form.postalCode.trim(),
    form.country.trim(),
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="hospital_name" className="text-sm font-medium">
            {t("settings.facilityName", "Facility name")}
          </label>
          <Input
            id="hospital_name"
            name="hospital_name"
            value={form.hospitalName}
            onChange={(e) => updateField("hospitalName", e.target.value)}
            required
            placeholder={t("settings.facilityNamePlaceholder", "e.g. City General Hospital")}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="facility_label" className="text-sm font-medium">
            {t("settings.facilityLabel", "Facility label")}
          </label>
          <Input
            id="facility_label"
            name="facility_label"
            value={form.facilityLabel}
            onChange={(e) => updateField("facilityLabel", e.target.value)}
            placeholder={t("settings.facilityLabel", "Facility")}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="phone" className="text-sm font-medium">
            {t("settings.phone", "Phone")}
          </label>
          <Input
            id="phone"
            name="phone"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder={t("settings.phonePlaceholder", "Primary facility phone number")}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            {t("settings.email", "Email")}
          </label>
          <Input
            id="email"
            name="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder={t("settings.emailPlaceholder", "Contact email shown on invoices")}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="country" className="text-sm font-medium">{t("settings.country", "Country")}</label>
          <select
            id="country"
            name="country"
            value={form.country}
            onChange={(e) => applyCountryPreset(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t("settings.countryHint", "Changing country updates regional defaults for phone code, currency, locale, language, timezone, and labels.")}
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="address_line_1" className="text-sm font-medium">{t("settings.addressLine1", "Address line 1")}</label>
          <Input id="address_line_1" name="address_line_1" value={form.addressLine1} onChange={(e) => updateField("addressLine1", e.target.value)} placeholder={t("settings.addressLine1Placeholder", "Street address")} />
        </div>
        <div className="space-y-1">
          <label htmlFor="address_line_2" className="text-sm font-medium">{t("settings.addressLine2", "Address line 2")}</label>
          <Input id="address_line_2" name="address_line_2" value={form.addressLine2} onChange={(e) => updateField("addressLine2", e.target.value)} placeholder={t("settings.addressLine2Placeholder", "Suite, block, or unit")} />
        </div>
        <div className="space-y-1">
          <label htmlFor="city" className="text-sm font-medium">{form.cityLabel}</label>
          <Input id="city" name="city" value={form.city} onChange={(e) => updateField("city", e.target.value)} placeholder={form.cityLabel} />
        </div>
        <div className="space-y-1">
          <label htmlFor="state_or_province" className="text-sm font-medium">{form.stateLabel}</label>
          <Input id="state_or_province" name="state_or_province" value={form.stateOrProvince} onChange={(e) => updateField("stateOrProvince", e.target.value)} placeholder={form.stateLabel} />
        </div>
        <div className="space-y-1">
          <label htmlFor="postal_code" className="text-sm font-medium">{selectedPreset?.postalCodeLabel || t("settings.postalCode", "Postal code")}</label>
          <Input
            id="postal_code"
            name="postal_code"
            value={form.postalCode}
            onChange={(e) => updateField("postalCode", e.target.value)}
            placeholder={selectedPreset?.postalCodeLabel || t("settings.postalCode", "Postal code")}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="state_label" className="text-sm font-medium">{t("settings.regionLabel", "Region label")}</label>
          <select
            id="state_label"
            name="state_label"
            value={form.stateLabel}
            onChange={(e) => updateField("stateLabel", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {regionLabelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="city_label" className="text-sm font-medium">{t("settings.cityLabel", "City label")}</label>
          <select
            id="city_label"
            name="city_label"
            value={form.cityLabel}
            onChange={(e) => updateField("cityLabel", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {cityLabelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="phone_country_code" className="text-sm font-medium">{t("settings.phoneCountryCode", "Phone country code")}</label>
          <select
            id="phone_country_code"
            name="phone_country_code"
            value={form.phoneCountryCode}
            onChange={(e) => updatePhoneCode(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {phoneCodeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="currency_code" className="text-sm font-medium">{t("settings.currency", "Currency")}</label>
          <select
            id="currency_code"
            name="currency_code"
            value={form.currencyCode}
            onChange={(e) => updateField("currencyCode", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {currencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="locale" className="text-sm font-medium">{t("settings.locale", "Locale")}</label>
          <select
            id="locale"
            name="locale"
            value={form.locale}
            onChange={(e) => updateField("locale", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {localeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="language" className="text-sm font-medium">{t("settings.language", "Language")}</label>
          <select
            id="language"
            name="language"
            value={form.language}
            onChange={(e) => updateField("language", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="timezone" className="text-sm font-medium">{t("settings.timezone", "Timezone")}</label>
          <select
            id="timezone"
            name="timezone"
            value={form.timezone}
            onChange={(e) => updateField("timezone", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {timezoneOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="date_format" className="text-sm font-medium">{t("settings.dateFormat", "Date format")}</label>
          <select
            id="date_format"
            name="date_format"
            value={form.dateFormat}
            onChange={(e) => updateField("dateFormat", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {DATE_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="time_format" className="text-sm font-medium">{t("settings.timeFormat", "Time format")}</label>
          <select
            id="time_format"
            name="time_format"
            value={form.timeFormat}
            onChange={(e) => updateField("timeFormat", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
          >
            {TIME_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="public_coverage_label" className="text-sm font-medium">{t("settings.publicCoverageLabel", "Public coverage label")}</label>
          <Input
            id="public_coverage_label"
            name="public_coverage_label"
            value={form.publicCoverageLabel}
            onChange={(e) => updateField("publicCoverageLabel", e.target.value)}
            placeholder={t("settings.publicCoveragePlaceholder", "Public coverage")}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="billing_logo_url" className="text-sm font-medium">
            {t("settings.logoUrl", "Logo URL")}
          </label>
          <Input
            id="billing_logo_url"
            name="billing_logo_url"
            value={form.billingLogoUrl}
            onChange={(e) => updateField("billingLogoUrl", e.target.value)}
            placeholder={t("settings.logoUrlPlaceholder", "https://.../logo.png")}
          />
          <p className="text-xs text-muted-foreground">
            {t("settings.logoUrlHint", "You can paste a public image URL or upload a logo file.")}
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="billing_logo_file" className="text-sm font-medium">
            {t("settings.uploadLogo", "Upload logo")}
          </label>
          <Input id="billing_logo_file" name="billing_logo_file" type="file" accept="image/*" />
          <p className="text-xs text-muted-foreground">
            {t("settings.uploadLogoHint", "If a file is uploaded, it will be stored and used instead of the URL.")}
          </p>
        </div>
      </div>

      {form.billingLogoUrl ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.currentLogo", "Current logo")}</p>
          <img
            src={form.billingLogoUrl}
            alt={t("settings.currentLogoAlt", "Facility logo preview")}
            className="h-16 w-auto rounded border bg-white object-contain p-1"
          />
        </div>
      ) : null}

      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        {t("settings.currentAddress", "Current formatted facility address:")} {formattedAddress || t("settings.currentAddressEmpty", "Not configured yet.")}
      </div>

      <div className="flex justify-end">
        <Button type="submit">{t("common.saveFacilitySettings", "Save facility settings")}</Button>
      </div>
    </form>
  )
}
