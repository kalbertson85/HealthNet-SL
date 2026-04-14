import en from "@/locales/en.json"
import fr from "@/locales/fr.json"

const dictionaries = {
  en,
  fr,
} as const

export type SupportedLanguage = keyof typeof dictionaries
export type Dictionary = (typeof dictionaries)[SupportedLanguage]

function isSupportedLanguage(language?: string | null): language is SupportedLanguage {
  return language === "en" || language === "fr"
}

export function getDictionary(language?: string | null): Dictionary {
  if (isSupportedLanguage(language)) return dictionaries[language]
  return dictionaries.en
}

function resolveKey(dictionary: Dictionary, key: string): string | null {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return null
    return (current as Record<string, unknown>)[segment] ?? null
  }, dictionary)

  return typeof value === "string" ? value : null
}

export function t(language: string | null | undefined, key: string, fallback?: string) {
  const dictionary = getDictionary(language)
  return resolveKey(dictionary, key) || fallback || key
}

export function createTranslator(language?: string | null) {
  return (key: string, fallback?: string) => t(language, key, fallback)
}
