"use client"

import type React from "react"
import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { createBrowserClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createBrowserClient(), [])

  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null)

  const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
  const STORAGE_KEY = "hms:last_password_reset_request"

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const last = Number(raw)
    if (!Number.isFinite(last)) return

    const now = Date.now()
    const remaining = last + COOLDOWN_MS - now
    if (remaining > 0) {
      setCooldownRemaining(remaining)
    }
  }, [])

  useEffect(() => {
    if (cooldownRemaining === null) return
    if (cooldownRemaining <= 0) {
      setCooldownRemaining(null)
      return
    }

    const id = window.setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev === null) return null
        const next = prev - 1000
        return next > 0 ? next : 0
      })
    }, 1000)

    return () => window.clearInterval(id)
  }, [cooldownRemaining])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (cooldownRemaining && cooldownRemaining > 0) {
      setLoading(false)
      setError("A reset link was requested recently. Please wait a few minutes before trying again.")
      return
    }

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const redirectTo = origin ? `${origin}/auth/update-password` : undefined

      const trimmedEmail = email.trim()
      const normalizedEmail = trimmedEmail.toLowerCase()

      // Server-side rate limiting via RPC using password_reset_events
      const { data: canRequest, error: rateLimitError } = await supabase.rpc("can_request_password_reset", {
        p_email: normalizedEmail,
      })

      if (rateLimitError) {
        setError("Unable to check reset limits. Please try again in a few minutes.")
        return
      }

      if (canRequest === false) {
        setError("A reset link was requested recently. Please wait a few minutes before trying again.")
        return
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      })

      if (resetError) {
        setError(resetError.message || "Unable to send password reset email.")
        return
      }

      setSuccess(
        "If an account exists for this email, a password reset link has been sent. Please check your inbox and follow the instructions.",
      )

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
        setCooldownRemaining(COOLDOWN_MS)
      }

      // Best-effort logging of reset-start event for audit/monitoring
      void supabase.from("password_reset_events").insert({ email: normalizedEmail })
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message || "Unable to start password reset.")
      } else {
        setError("Unable to start password reset.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center px-4 py-6 sm:py-8">
      <div className="w-full max-w-md">
        <Card className="shadow-lg border border-slate-100">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-slate-900">Forgot password</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" aria-label="Forgot password form">
              {error && (
                <Alert variant="destructive" aria-live="assertive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert aria-live="polite">
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              {cooldownRemaining !== null && cooldownRemaining > 0 && (
                <p className="text-xs text-slate-600">
                  You can request another reset link in{" "}
                  {Math.max(0, Math.floor(cooldownRemaining / 1000 / 60))}m
                  {" "}
                  {Math.max(0, Math.floor((cooldownRemaining / 1000) % 60)).toString().padStart(2, "0")}s.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending reset link...
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>

              <div className="text-center text-sm text-slate-600">
                <Link href="/auth/login" className="text-sky-700 hover:underline font-medium">
                  Back to login
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
