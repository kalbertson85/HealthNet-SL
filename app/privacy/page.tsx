import Link from "next/link"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900">Privacy</h1>
        <p className="mt-4 text-gray-700">
          HealthNet-SL HMS is built to protect patient and facility data. Access is role-based, activity is auditable,
          and sensitive operations are logged for accountability.
        </p>
        <p className="mt-3 text-gray-700">
          For data handling questions, retention requests, or privacy incident reporting, contact the support team via
          the contact page.
        </p>
        <div className="mt-8">
          <Link href="/contact" className="text-primary hover:underline">
            Contact support
          </Link>
        </div>
      </div>
    </main>
  )
}
