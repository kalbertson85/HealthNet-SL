"use client"

import { useEffect, useMemo, useState } from "react"

type SectionConfig = {
  id: string
  label: string
  requiredFields: string[]
}

interface PatientRegistrationProgressProps {
  formId: string
  sections: SectionConfig[]
  labelsByFieldId: Record<string, string>
}

function readFieldValue(element: Element | null): string {
  if (!element) return ""
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      return element.checked ? "1" : ""
    }
    return element.value.trim()
  }
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return element.value.trim()
  }
  return ""
}

export function PatientRegistrationProgress({
  formId,
  sections,
  labelsByFieldId,
}: PatientRegistrationProgressProps) {
  const [filledFieldIds, setFilledFieldIds] = useState<string[]>([])

  const allRequiredFieldIds = useMemo(
    () => Array.from(new Set(sections.flatMap((section) => section.requiredFields))),
    [sections],
  )

  useEffect(() => {
    const form = document.getElementById(formId)
    if (!(form instanceof HTMLFormElement)) return

    const evaluate = () => {
      const nextFilled = allRequiredFieldIds.filter((fieldId) => {
        const element = form.querySelector(`#${fieldId}`)
        return Boolean(readFieldValue(element))
      })
      setFilledFieldIds(nextFilled)
    }

    evaluate()
    form.addEventListener("input", evaluate)
    form.addEventListener("change", evaluate)

    return () => {
      form.removeEventListener("input", evaluate)
      form.removeEventListener("change", evaluate)
    }
  }, [allRequiredFieldIds, formId])

  const missingFieldLabels = allRequiredFieldIds
    .filter((fieldId) => !filledFieldIds.includes(fieldId))
    .map((fieldId) => labelsByFieldId[fieldId] || fieldId)

  const completionPercent = allRequiredFieldIds.length
    ? Math.round((filledFieldIds.length / allRequiredFieldIds.length) * 100)
    : 0

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Form progress</p>
        <p className="text-xs text-muted-foreground">
          {filledFieldIds.length}/{allRequiredFieldIds.length} required fields complete ({completionPercent}%)
        </p>
      </div>

      <div className="mt-2 h-2 w-full rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${completionPercent}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {sections.map((section) => {
          const completed = section.requiredFields.filter((fieldId) => filledFieldIds.includes(fieldId)).length
          const total = section.requiredFields.length
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
            >
              <p className="font-medium">{section.label}</p>
              <p className="text-muted-foreground">
                {completed}/{total} required
              </p>
            </a>
          )
        })}
      </div>

      {missingFieldLabels.length > 0 ? (
        <p className="mt-3 text-xs text-amber-700">Missing: {missingFieldLabels.join(", ")}</p>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">All required fields are complete.</p>
      )}
    </div>
  )
}
