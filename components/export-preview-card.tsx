import Link from "next/link"
import { Download } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatNumber, type GlobalSettingsInput } from "@/lib/locale-format"

interface ExportPreviewCardProps {
  title: string
  description: string
  href: string
  previewCount: number
  previewLabel: string
  limitNote?: string | null
  settings?: GlobalSettingsInput
}

export function ExportPreviewCard({
  title,
  description,
  href,
  previewCount,
  previewLabel,
  limitNote,
  settings,
}: ExportPreviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium">{formatNumber(previewCount, settings)}</span> {previewLabel}
          </p>
          {limitNote ? <p className="text-xs text-muted-foreground">{limitNote}</p> : null}
        </div>
        <Button asChild>
          <Link href={href}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
