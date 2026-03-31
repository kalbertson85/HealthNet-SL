import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface TableCardProps {
  title: string
  description?: string
  children: ReactNode
}

export function TableCard({ title, description, children }: TableCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">{children}</div>
      </CardContent>
    </Card>
  )
}
