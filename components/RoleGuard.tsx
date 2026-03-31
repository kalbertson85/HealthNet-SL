"use client"

import type React from "react"
import { useRouter } from "next/navigation"
import type { Role } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface RoleGuardProps {
  role?: string | null
  allowedRoles: Role[]
  children: React.ReactNode
  fallback?: React.ReactNode
  className?: string
}

export function RoleGuard({ role, allowedRoles, children, fallback, className }: RoleGuardProps) {
  const router = useRouter()

  const normalized = role?.toLowerCase() as Role | undefined
  const isAllowed = normalized ? allowedRoles.includes(normalized) : false

  if (!isAllowed) {
    if (fallback) {
      return <div className={cn("w-full", className)}>{fallback}</div>
    }

    return (
      <div className={cn("flex min-h-[200px] w-full flex-col items-center justify-center text-center", className)}>
        <p className="text-sm font-medium">You don&apos;t have permission to view this section.</p>
        <button
          type="button"
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          onClick={() => router.push("/dashboard")}
        >
          Go back to dashboard
        </button>
      </div>
    )
  }

  return <>{children}</>
}
