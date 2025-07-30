"use client"

import { signIn } from "@raypx/auth/client"
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
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

export const SignUpForm = () => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const params = useSearchParams()

  const handleSocialSignUp = async (provider: "github" | "google") => {
    try {
      setIsLoading(true)
      const res = await signIn.social({
        provider,
        callbackURL: window.location.href,
      })
      if (res.error) {
        toast.error(res.error.message)
      } else if (res.data.redirect && res.data.url) {
        window.location.href = res.data.url
      } else {
        toast.success("Sign in successful")
        window.location.href = params.get("redirect") || window.location.href
      }
    } catch (_error) {
      toast.error("Sign in failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
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
  )
}
