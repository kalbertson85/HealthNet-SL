"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, User, LogOut } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { signOut } from "@/app/actions/auth"

interface DashboardUser {
  id: string
  email?: string | null
}

interface DashboardProfile {
  full_name?: string | null
  role?: string | null
}

interface DashboardHeaderProps {
  user?: DashboardUser | null
  profile?: DashboardProfile | null
  hospitalName?: string
  hospitalLogoUrl?: string
}

export function DashboardHeader({ user, profile, hospitalName, hospitalLogoUrl }: DashboardHeaderProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/dashboard/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push("/auth/login")
  }

  const getInitials = (name?: string) => {
    if (!name) return "U"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="flex h-20 items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          {hospitalLogoUrl && (
            <img
              src={hospitalLogoUrl}
              alt={hospitalName ? `${hospitalName} logo` : "Hospital logo"}
              className="h-9 w-9 rounded bg-white object-contain shadow-sm border sm:h-10 sm:w-10"
            />
          )}
          <span className="text-xl sm:text-2xl font-semibold tracking-tight text-primary/80">
            {hospitalName || "HealthNet-SL HMS"}
          </span>
        </div>

        <form onSubmit={handleSearch} className="flex-1 max-w-md ml-auto mr-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search patients, appointments, prescriptions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full"
            />
          </div>
        </form>

        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarFallback>{getInitials(profile?.full_name ?? undefined)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{profile?.full_name || "User"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  {profile?.role && <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                <User className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
