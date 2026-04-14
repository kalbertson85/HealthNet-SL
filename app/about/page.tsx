import Link from "next/link"
import { APP_BRAND_NAME, APP_TAGLINE } from "@/config/global"

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900">About {APP_BRAND_NAME}</h1>
        <p className="mt-4 text-gray-700">
          {APP_BRAND_NAME} is a hospital management platform for hospitals, clinics, and multi-site care networks to
          manage patient records, appointments, billing, pharmacy, diagnostics, and reporting.
        </p>
        <p className="mt-3 text-gray-700">
          The system is designed to support frontline teams with faster workflows, cleaner records, stronger visibility,
          and globally configurable regional settings.
        </p>
        <p className="mt-3 text-gray-700">{APP_TAGLINE}</p>
        <div className="mt-8">
          <Link href="/" className="text-primary hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
