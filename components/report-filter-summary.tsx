interface ReportFilterSummaryProps {
  items: Array<{ label: string; value: string | null | undefined }>
}

export function ReportFilterSummary({ items }: ReportFilterSummaryProps) {
  const activeItems = items.filter((item) => item.value && item.value.trim().length > 0)

  if (activeItems.length === 0) {
    return null
  }

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Active filters:</span>
        {activeItems.map((item) => (
          <span key={`${item.label}-${item.value}`} className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs text-blue-900">
            {item.label}: {item.value}
          </span>
        ))}
      </div>
    </div>
  )
}
