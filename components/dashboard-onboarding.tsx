"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Role = string | null | undefined

const DISMISS_KEY = "healthnet.dashboard.onboarding.dismissed.v1"

function roleTips(role: Role) {
  const normalized = (role || "").toLowerCase()

  if (["doctor", "nurse"].includes(normalized)) {
    return {
      title: "Clinical Quick Start",
      items: [
        { label: "Review queue", href: "/dashboard/queue" },
        { label: "Open emergency board", href: "/dashboard/emergency" },
        { label: "Start patient review", href: "/dashboard/patients" },
      ],
    }
  }

  if (["facility_admin", "admin"].includes(normalized)) {
    return {
      title: "Admin Quick Start",
      items: [
        { label: "View system activity", href: "/dashboard/admin/system-activity" },
        { label: "Open reports", href: "/dashboard/reports" },
        { label: "Manage users", href: "/dashboard/admin/users" },
      ],
    }
  }

  return {
    title: "Operations Quick Start",
    items: [
      { label: "Register patient", href: "/dashboard/patients/new" },
      { label: "Book appointment", href: "/dashboard/appointments/new" },
      { label: "Check billing", href: "/dashboard/billing" },
    ],
  }
}

export function DashboardOnboarding({ role }: { role: Role }) {
  const [visible, setVisible] = useState(false)
  const tips = useMemo(() => roleTips(role), [role])

  useEffect(() => {
    const dismissed = window.localStorage.getItem(DISMISS_KEY)
    setVisible(!dismissed)
  }, [])

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tips.title}</CardTitle>
        <CardDescription>Use these shortcuts to complete common workflows faster.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {tips.items.map((item) => (
          <Button key={item.href} asChild size="sm" variant="outline">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
        <Button size="sm" onClick={dismiss}>
          Dismiss
        </Button>
      </CardContent>
    </Card>
  )
}
