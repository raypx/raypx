"use client"

import { signOut, useSession } from "@raypx/auth/client"
import { Button } from "@raypx/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { toast } from "@raypx/ui/components/toast"
import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const router = useRouter()
  const { data: session } = useSession()

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success("Signed out successfully")
      router.push("/sign-in")
    } catch (_error) {
      toast.error("Failed to sign out")
    }
  }

  if (!session) {
    router.push("/sign-in")
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button onClick={handleSignOut} variant="outline">
            Sign out
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Welcome back!</CardTitle>
              <CardDescription>You have successfully logged in</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Email: {session.user?.email}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>View your account details</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                User ID: {session.user?.id}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common functions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button className="w-full" variant="outline">
                  Personal Settings
                </Button>
                <Button className="w-full" variant="outline">
                  Security Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
