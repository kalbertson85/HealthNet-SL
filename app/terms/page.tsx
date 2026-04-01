import Link from "next/link"

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900">Terms of Use</h1>
        <p className="mt-4 text-gray-700">
          By using HealthNet-SL HMS, your facility agrees to use the platform for lawful clinical and operational
          workflows, maintain accurate data entry, and protect login credentials.
        </p>
        <p className="mt-3 text-gray-700">
          Administrators are responsible for user provisioning, role assignment, and policy compliance within their
          organization.
        </p>
        <div className="mt-8">
          <Link href="/contact" className="text-primary hover:underline">
            Contact us for full terms
          </Link>
        </div>
      </div>
    </main>
  )
}
