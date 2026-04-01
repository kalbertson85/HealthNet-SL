"use client"

import Link from "next/link"
import { Activity, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Activity className="h-12 w-12 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Account Access</CardTitle>
          <CardDescription>HealthNet-SL accounts are provisioned by hospital administrators.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>
              Self sign-up is disabled for security. Request an account from your hospital administrator.
            </AlertDescription>
          </Alert>

          <div className="grid gap-2">
            <Link href="/auth/login">
              <Button className="w-full">Back to login</Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" className="w-full">
                Contact support
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
