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

export default function SignUpPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleSocialSignUp = async (provider: "github" | "google") => {
    setIsLoading(true)
    toast.info(`Redirecting to ${provider} sign up...`)
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Sign Up</CardTitle>
          <CardDescription className="text-center">
            Choose your sign up method
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Social Sign Up */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSocialSignUp("github")}
              disabled={isLoading}
            >
              <Github className="mr-2 h-4 w-4" />
              Sign up with GitHub
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSocialSignUp("google")}
              disabled={isLoading}
            >
              <Mail className="mr-2 h-4 w-4" />
              Sign up with Google
            </Button>
          </div>

          <div className="text-center text-sm">
            Already have an account?{" "}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => router.push("/sign-in")}
            >
              Sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
