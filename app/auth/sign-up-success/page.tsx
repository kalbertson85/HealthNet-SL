import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Mail } from "lucide-react"

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Check Your Email</CardTitle>
          <CardDescription>We’ve sent you a confirmation link</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <Mail className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-700">
              Please check your email inbox and click the confirmation link to activate your account.
            </p>
          </div>

          <div className="text-sm text-gray-600 space-y-2">
            <p>After confirming your email, you’ll be able to:</p>
            <ul className="list-disc list-inside text-left space-y-1">
              <li>Access the hospital dashboard</li>
              <li>Manage patients and appointments</li>
              <li>Create prescriptions and lab orders</li>
              <li>Process billing and payments</li>
            </ul>
          </div>

          <Link href="/auth/login">
            <Button className="w-full">Go to Sign In</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
