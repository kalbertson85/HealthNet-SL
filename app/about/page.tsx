import Link from "next/link"

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900">About HealthNet-SL HMS</h1>
        <p className="mt-4 text-gray-700">
          HealthNet-SL HMS is a hospital management platform built for Sierra Leone health facilities to manage patient
          records, appointments, billing, pharmacy, lab workflows, and reporting.
        </p>
        <p className="mt-3 text-gray-700">
          The system is designed to support frontline teams with faster workflows, cleaner records, and stronger
          visibility into daily operations.
        </p>
        <div className="mt-8">
          <Link href="/" className="text-primary hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
