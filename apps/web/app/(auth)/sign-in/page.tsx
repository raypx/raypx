"use client"

import { Button } from "@raypx/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { toast } from "@raypx/ui/components/toast"
import { Github, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function SignInPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleSocialSignIn = async (provider: "github" | "google") => {
    setIsLoading(true)
    toast.info(`Redirecting to ${provider} sign in...`)
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Sign In</CardTitle>
          <CardDescription className="text-center">
            Choose your sign in method
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Social Login */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSocialSignIn("github")}
              disabled={isLoading}
            >
              <Github className="mr-2 h-4 w-4" />
              Sign in with GitHub
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSocialSignIn("google")}
              disabled={isLoading}
            >
              <Mail className="mr-2 h-4 w-4" />
              Sign in with Google
            </Button>
          </div>

          <div className="text-center text-sm">
            Don't have an account?{" "}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => router.push("/sign-up")}
            >
              Sign up
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
