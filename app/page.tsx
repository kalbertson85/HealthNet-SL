import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Activity, FileText, Users, Calendar, TestTube, Pill, DollarSign, BedDouble, Facebook, Linkedin, Twitter } from "lucide-react"

export default async function HomePage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="mx-auto w-full max-w-7xl px-3 py-16 sm:px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Activity className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="mb-4 break-words text-xl font-bold leading-tight text-gray-900 sm:text-4xl md:text-5xl">
            Smarter Health Management for Stronger Care
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-gray-700 sm:text-xl">
            HealthNet-SL HMS empowers hospitals in Sierra Leone with real-time digital records, analytics, and
            automation.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link href="/auth/login">
              <Button size="lg" className="min-w-36 bg-primary hover:bg-primary/90">
                Get Started
              </Button>
            </Link>
            <Link href="/auth/sign-up">
              <Button size="lg" variant="outline" className="min-w-36">
                Request Demo
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <Card>
            <CardHeader>
              <Users className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Patient Records</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Complete patient records, demographics, medical history, and emergency contacts
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Calendar className="h-8 w-8 text-teal-600 mb-2" />
              <CardTitle>Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Schedule and manage appointments with doctors, track consultations and follow-ups
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Pill className="h-8 w-8 text-purple-600 mb-2" />
              <CardTitle>Pharmacy & Prescriptions</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create prescriptions, manage pharmacy inventory, and track dispensed medications
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <TestTube className="h-8 w-8 text-pink-600 mb-2" />
              <CardTitle>Lab Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Order lab tests, record results, and track diagnostic procedures</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <DollarSign className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Billing & Finance</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Generate invoices, track payments with mobile money support for Sierra Leone
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <BedDouble className="h-8 w-8 text-orange-600 mb-2" />
              <CardTitle>Inpatient Care</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Manage ward admissions, bed assignments, and patient vitals monitoring</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Activity className="h-8 w-8 text-red-600 mb-2" />
              <CardTitle>Emergency & Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Priority-based triage assessment with color-coded emergency case management
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <FileText className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Reports & SMS Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>Comprehensive reporting with DHIS2 export for national health data</CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* How It Works */}
        <Card className="max-w-3xl mx-auto mt-8">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
            <CardDescription>Three simple steps to get your hospital live on HealthNet-SL HMS</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">1. Register</h3>
                <p className="text-sm text-gray-600">Create your hospital account and invite your core team.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">2. Configure</h3>
                <p className="text-sm text-gray-600">Set up departments, wards, billing rules, and user roles.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">3. Start Managing</h3>
                <p className="text-sm text-gray-600">
                  Go live with digital patient records, billing, lab, and pharmacy workflows.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Plans */}
        <section className="mt-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Subscription Plans</h2>
            <p className="text-gray-700 max-w-2xl mx-auto text-sm md:text-base">
              Choose a plan tailored to the size and needs of your facility. All plans include secure hosting, updates,
              and support.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle>Starter</CardTitle>
                <CardDescription>For community and primary health facilities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p className="text-2xl font-bold text-primary">Le 0<span className="text-base font-normal"> / pilot</span></p>
                <ul className="space-y-1">
                  <li>• Core patient records and appointments</li>
                  <li>• Basic billing and invoices</li>
                  <li>• Single facility, limited users</li>
                </ul>
                <Link href="/contact" className="block">
                  <Button variant="outline" className="mt-2 w-full">
                    Talk to sales
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-primary/40 shadow-md">
              <CardHeader>
                <CardTitle>Professional</CardTitle>
                <CardDescription>For district hospitals and mission hospitals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p className="text-2xl font-bold text-primary">
                  Le 0<span className="text-base font-normal"> / year (intro pricing)</span>
                </p>
                <ul className="space-y-1">
                  <li>• Everything in Starter</li>
                  <li>• Lab, pharmacy, inpatient and queue management</li>
                  <li>• SMS alerts and DHIS2-ready exports</li>
                </ul>
                <Link href="/auth/sign-up" className="block">
                  <Button className="mt-2 w-full bg-primary hover:bg-primary/90">Request demo</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <CardDescription>For regional, teaching and private hospitals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p className="text-2xl font-bold text-primary">Contact us</p>
                <ul className="space-y-1">
                  <li>• Everything in Professional</li>
                  <li>• Advanced analytics and multi-site support</li>
                  <li>• Integration with national eHealth systems</li>
                </ul>
                <Link href="/contact" className="block">
                  <Button variant="outline" className="mt-2 w-full">
                    Book a consultation
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mt-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">What hospitals are saying</h2>
            <p className="text-gray-700 max-w-2xl mx-auto text-sm md:text-base">
              HealthNet-SL HMS is designed together with clinicians, administrators, and pharmacists in Sierra Leone.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="shadow-sm">
              <CardContent className="pt-6 text-sm text-gray-700 space-y-3">
                <p className="italic">
                  &quot;We save hours every week on manual registers. Patient records are now one click away for our doctors.&quot;
                </p>
                <div>
                  <p className="font-semibold">Medical Superintendent</p>
                  <p className="text-xs text-gray-500">District Hospital, Sierra Leone</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6 text-sm text-gray-700 space-y-3">
                <p className="italic">
                  &quot;Billing, pharmacy, and lab now talk to each other. It&apos;s easier to see what is going on in the
                  hospital.&quot;
                </p>
                <div>
                  <p className="font-semibold">Hospital Administrator</p>
                  <p className="text-xs text-gray-500">Mission Hospital</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6 text-sm text-gray-700 space-y-3">
                <p className="italic">
                  &quot;As a pharmacist, I can see all pending prescriptions and what has been dispensed today in one place.&quot;
                </p>
                <div>
                  <p className="font-semibold">Pharmacy Lead</p>
                  <p className="text-xs text-gray-500">Regional Hospital</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t border-border pt-8 text-sm text-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <p className="font-semibold text-gray-800">HealthNet-SL HMS</p>
              <p className="text-xs md:text-sm">
                Smarter health management for stronger care in Sierra Leone&apos;s hospitals.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2 text-xs md:text-sm">
              <Link href="/about" className="inline-flex min-h-11 items-center px-2 hover:text-primary">
                About
              </Link>
              <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 hover:text-primary">
                Privacy
              </Link>
              <Link href="/terms" className="inline-flex min-h-11 items-center px-2 hover:text-primary">
                Terms
              </Link>
              <Link href="/contact" className="inline-flex min-h-11 items-center px-2 hover:text-primary">
                Contact
              </Link>
            </nav>
            <div className="flex items-center gap-3 text-gray-500">
              <Link
                href="/contact#social"
                aria-label="HealthNet-SL on Facebook"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:text-primary"
              >
                <Facebook className="h-4 w-4" />
              </Link>
              <Link
                href="/contact#social"
                aria-label="HealthNet-SL on LinkedIn"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:text-primary"
              >
                <Linkedin className="h-4 w-4" />
              </Link>
              <Link
                href="/contact#social"
                aria-label="HealthNet-SL on Twitter"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:text-primary"
              >
                <Twitter className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-600">&copy; {new Date().getFullYear()} HealthNet-SL HMS. All rights reserved.</p>
        </footer>
      </div>
    </div>
  )
}
