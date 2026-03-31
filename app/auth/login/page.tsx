"use client"

import type React from "react"

import { Suspense, useState, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Quote } from "lucide-react"

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const supabase = useMemo(() => createBrowserClient(), [])

  const isBlocked = searchParams.get("blocked") === "1"

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.user) {
        router.push("/dashboard")
        router.refresh()
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to sign in")
      } else {
        setError("Failed to sign in")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center px-4 py-6 sm:py-8">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl border border-slate-100 grid md:grid-cols-2">
        {/* Left column: logo, branding and form */}
        <div className="flex flex-col justify-center gap-6 sm:gap-8 px-6 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10">
          <header className="flex items-center justify-center gap-3">
            <Image
              src="/healthnet-logo.png"
              alt="HealthNet-SL HMS logo"
              width={64}
              height={64}
              className="h-14 w-14 rounded-md object-contain"
            />
            <div>
              <p className="text-sm font-semibold tracking-wide text-sky-700">HealthNet-SL HMS</p>
              <p className="text-xs text-slate-500">Smarter Health Management for Stronger Care</p>
            </div>
          </header>

          <div className="space-y-6">
            <Card className="shadow-none border-0 p-0">
              <CardHeader className="px-0 pt-0 pb-4 items-center text-center">
                <CardTitle className="text-2xl md:text-3xl font-semibold text-slate-900">Welcome back</CardTitle>
                <CardDescription className="text-sm text-slate-600">
                  Sign in to manage patients, admissions, billing, and reporting across your hospital.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleLogin} className="space-y-4" aria-label="HealthNet-SL HMS login form">
                  {isBlocked && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Your account has been disabled. Please contact your hospital administrator to regain access.
                      </AlertDescription>
                    </Alert>
                  )}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="doctor@hospital.sl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <div className="flex justify-end text-xs">
                      <Link href="/auth/forgot-password" className="text-sky-700 hover:underline font-medium">
                        Forgot password?
                      </Link>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>

                  <div className="text-center text-sm">
                    <span className="text-gray-600">{"Don't have an account? "}</span>
                    <Link href="/auth/sign-up" className="text-sky-700 hover:underline font-medium">
                      Sign up
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>

            <section className="mt-3 sm:mt-4 space-y-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Purpose</p>
              <p>
                A cloud-based hospital management platform that simplifies patient care, administration, and reporting
                for Sierra Leone&apos;s hospitals.
              </p>
              <p className="mt-3 font-semibold text-slate-800">Target users</p>
              <p>Public and private hospitals, health centers, district hospitals, and mission hospitals.</p>
              <p className="mt-3 font-semibold text-slate-800">Core value</p>
              <p>Efficient management, accurate data, and better patient outcomes.</p>
            </section>
          </div>
        </div>

        {/* Right column: hero image and testimonial */}
        <div className="relative hidden md:block bg-slate-900/80">
          <Image
            src="/login-hero-doctor.png"
            alt="Clinician using HealthNet-SL HMS in a hospital corridor"
            fill
            className="object-cover opacity-70"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/70 to-slate-900/40" />

          <div className="relative z-10 flex h-full flex-col justify-between px-8 py-8">
            <div className="flex items-center gap-2 text-sky-100 text-xs uppercase tracking-[0.18em]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/90">
                <Quote className="h-4 w-4" />
              </span>
              <span>Trusted by hospitals across Sierra Leone</span>
            </div>

            <div className="mt-8 max-w-md space-y-4 text-slate-50">
              <p className="text-lg leading-relaxed font-medium">
                "HealthNet-SL HMS is a cloud-based hospital platform built in Sierra Leone, helping hospitals connect
                emergency, outpatient, inpatient, pharmacy, lab, and billing in one place for smoother patient journeys."
              </p>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">Built for Sierra Leone&apos;s health system</p>
                <p className="text-slate-200 text-xs">Designed with hospitals, districts, and mission facilities in mind</p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 text-xs text-slate-100">
              <div>
                <p className="font-semibold">30% faster admissions</p>
                <p className="text-slate-300">Streamlined triage, inpatient, and emergency workflows.</p>
              </div>
              <div>
                <p className="font-semibold">Improved data quality</p>
                <p className="text-slate-300">Centralised records for reporting to MOHS and partners.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50" />}>
      <LoginPageContent />
    </Suspense>
  )
}
