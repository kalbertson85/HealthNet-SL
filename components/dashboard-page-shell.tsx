import type { ReactNode } from "react"

interface DashboardPageShellProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function DashboardPageShell({ title, description, actions, children }: DashboardPageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {children}
    </div>
  )
}
