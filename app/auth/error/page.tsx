import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { message?: string }
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <AlertCircle className="h-16 w-16 text-red-600" />
          </div>
          <CardTitle className="text-2xl">Authentication Error</CardTitle>
          <CardDescription>Something went wrong</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-sm text-gray-700">
              {searchParams.message || "An error occurred during authentication. Please try again."}
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/auth/login" className="flex-1">
              <Button variant="outline" className="w-full bg-transparent">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/sign-up" className="flex-1">
              <Button className="w-full">Sign Up</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
