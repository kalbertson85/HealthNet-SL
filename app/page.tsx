import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import {
  Activity,
  FileText,
  Users,
  Calendar,
  TestTube,
  Pill,
  DollarSign,
  BedDouble,
  Facebook,
  Linkedin,
  Twitter,
} from "lucide-react"
import { getGlobalSettings } from "@/lib/global-settings"
import { formatCurrency } from "@/lib/locale-format"
import { getDictionary } from "@/lib/i18n"

export default async function HomePage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/dashboard")
  }

  const settings = await getGlobalSettings()
  const dictionary = getDictionary(settings.language)

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-3 py-16 sm:px-4">
        <div className="mb-16 text-center">
          <div className="mb-6 flex justify-center">
            <Activity className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="mb-4 break-words text-xl font-bold leading-tight text-gray-900 sm:text-4xl md:text-5xl">
            {dictionary.public.heroTitle}
          </h1>
          <p className="mx-auto max-w-2xl text-sm text-gray-700 sm:text-xl">{dictionary.public.heroSubtitle}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link href="/auth/login">
              <Button size="lg" className="min-w-36 bg-primary hover:bg-primary/90">
                {dictionary.public.getStarted}
              </Button>
            </Link>
            <Link href="/auth/sign-up">
              <Button size="lg" variant="outline" className="min-w-36">
                {dictionary.public.requestDemo}
              </Button>
            </Link>
          </div>
        </div>

        <div className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {[
            {
              icon: <Users className="mb-2 h-8 w-8 text-blue-600" />,
              title: "Patient Records",
              description: "Complete patient records, demographics, medical history, and emergency contacts.",
            },
            {
              icon: <Calendar className="mb-2 h-8 w-8 text-teal-600" />,
              title: "Appointments",
              description: "Schedule and manage appointments, consultations, and follow-ups.",
            },
            {
              icon: <Pill className="mb-2 h-8 w-8 text-purple-600" />,
              title: "Pharmacy & Prescriptions",
              description: "Create prescriptions, manage pharmacy inventory, and track dispensed medications.",
            },
            {
              icon: <TestTube className="mb-2 h-8 w-8 text-pink-600" />,
              title: "Lab Management",
              description: "Order lab tests, record results, and track diagnostic procedures.",
            },
            {
              icon: <DollarSign className="mb-2 h-8 w-8 text-green-600" />,
              title: "Billing & Finance",
              description: "Generate invoices, track payments, and support multiple payer workflows.",
            },
            {
              icon: <BedDouble className="mb-2 h-8 w-8 text-orange-600" />,
              title: "Inpatient Care",
              description: "Manage admissions, bed assignments, ward activity, and discharge planning.",
            },
            {
              icon: <Activity className="mb-2 h-8 w-8 text-red-600" />,
              title: "Emergency & Queue",
              description: "Coordinate priority-based triage and patient flow across clinical departments.",
            },
            {
              icon: <FileText className="mb-2 h-8 w-8 text-blue-600" />,
              title: "Reports & Alerts",
              description: "Run operational reports, export data, and monitor service activity across facilities.",
            },
          ].map((feature) => (
            <Card key={feature.title} className="min-w-0 w-full">
              <CardHeader>
                {feature.icon}
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="break-words">{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mx-auto mt-8 max-w-3xl">
          <CardHeader>
            <CardTitle>{dictionary.public.howItWorksTitle}</CardTitle>
            <CardDescription>{dictionary.public.howItWorksSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { number: 1, color: "bg-blue-600", title: "Register", text: "Create your facility account and invite your core team." },
              { number: 2, color: "bg-teal-600", title: "Configure", text: "Set up regions, wards, billing rules, locales, and user roles." },
              { number: 3, color: "bg-purple-600", title: "Start Managing", text: "Go live with digital patient records, billing, diagnostics, and pharmacy workflows." },
            ].map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-bold text-white ${step.color}`}>
                  {step.number}
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">{step.number}. {step.title}</h3>
                  <p className="text-sm text-gray-600">{step.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <section className="mt-16">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900">{dictionary.public.plansTitle}</h2>
            <p className="mx-auto max-w-2xl text-sm text-gray-700 md:text-base">{dictionary.public.plansSubtitle}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            <Card className="border border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle>Starter</CardTitle>
                <CardDescription>For community clinics and primary care teams</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p className="text-2xl font-bold text-primary">{formatCurrency(0, settings)}<span className="text-base font-normal"> / pilot</span></p>
                <ul className="space-y-1">
                  <li>• Core patient records and appointments</li>
                  <li>• Basic billing and invoices</li>
                  <li>• Single facility, limited users</li>
                </ul>
                <Link href="/contact" className="block">
                  <Button variant="outline" className="mt-2 w-full">Talk to sales</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-primary/40 shadow-md">
              <CardHeader>
                <CardTitle>Professional</CardTitle>
                <CardDescription>For general hospitals and growing care networks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p className="text-2xl font-bold text-primary">{formatCurrency(0, settings)}<span className="text-base font-normal"> / year (intro pricing)</span></p>
                <ul className="space-y-1">
                  <li>• Everything in Starter</li>
                  <li>• Diagnostics, pharmacy, inpatient, and queue management</li>
                  <li>• Alerts, exports, and operational analytics</li>
                </ul>
                <Link href="/auth/sign-up" className="block">
                  <Button className="mt-2 w-full bg-primary hover:bg-primary/90">Request demo</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <CardDescription>For regional, teaching, and multi-site facilities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p className="text-2xl font-bold text-primary">Contact us</p>
                <ul className="space-y-1">
                  <li>• Everything in Professional</li>
                  <li>• Advanced analytics and multi-site support</li>
                  <li>• Integration with external health systems</li>
                </ul>
                <Link href="/contact" className="block">
                  <Button variant="outline" className="mt-2 w-full">Book a consultation</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-16">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900">{dictionary.public.testimonialsTitle}</h2>
            <p className="text-sm text-gray-700 md:text-base">
              {dictionary.brand.name} is designed together with clinicians, administrators, and finance teams working across different care settings.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                quote: "We save hours every week on manual registers. Patient records are now available when the team needs them.",
                role: "Medical Superintendent",
                facility: "Regional hospital",
              },
              {
                quote: "Billing, pharmacy, and diagnostics are linked in one workflow, which reduced missed charges and duplicate work.",
                role: "Hospital Administrator",
                facility: "Private clinic network",
              },
              {
                quote: "The platform makes it easier to review covered services, submit insurer statements, and monitor balances by facility.",
                role: "Finance Lead",
                facility: "Teaching hospital",
              },
            ].map((item, index) => (
              <Card key={index}>
                <CardContent className="space-y-3 p-6 text-sm text-gray-600">
                  <p>“{item.quote}”</p>
                  <div>
                    <p className="font-semibold text-gray-900">{item.role}</p>
                    <p className="text-xs text-gray-500">{item.facility}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <footer className="mt-16 border-t border-slate-200 pt-8 text-sm text-gray-600">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-semibold text-gray-800">{dictionary.brand.name}</p>
              <p>{dictionary.brand.tagline}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/about" className="hover:text-primary">About</Link>
              <Link href="/privacy" className="hover:text-primary">Privacy</Link>
              <Link href="/terms" className="hover:text-primary">Terms</Link>
              <Link href="/contact" className="hover:text-primary">Contact</Link>
            </div>
            <div className="flex items-center gap-3 text-gray-500">
              <a href="#social" aria-label="HealthNet on Facebook"><Facebook className="h-4 w-4" /></a>
              <a href="#social" aria-label="HealthNet on LinkedIn"><Linkedin className="h-4 w-4" /></a>
              <a href="#social" aria-label="HealthNet on Twitter"><Twitter className="h-4 w-4" /></a>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-600">&copy; {new Date().getFullYear()} {dictionary.brand.name}. All rights reserved.</p>
        </footer>
      </div>
    </div>
  )
}
