import Link from "next/link"
import { APP_BRAND_NAME } from "@/config/global"

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold text-gray-900">Contact {APP_BRAND_NAME}</h1>
        <p className="mt-4 text-gray-700">
          For onboarding, demos, implementation support, or technical issues, contact the {APP_BRAND_NAME} team.
        </p>

        <div className="mt-8 space-y-3 rounded-lg border bg-white p-5">
          <p className="text-sm text-gray-800">
            Email:{" "}
            <a href="mailto:support@healthnet.app" className="text-primary hover:underline">
              support@healthnet.app
            </a>
          </p>
          <p className="text-sm text-gray-800">
            Sales:{" "}
            <a href="mailto:sales@healthnet.app" className="text-primary hover:underline">
              sales@healthnet.app
            </a>
          </p>
          <p className="text-sm text-gray-800" id="social">
            Social: Official social channels are being finalized. Use email for all current support and partnership
            requests.
          </p>
        </div>

        <div className="mt-8">
          <Link href="/" className="text-primary hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
