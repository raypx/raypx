"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@raypx/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { Github, Mail } from "lucide-react"
import { toast } from "@raypx/ui/components/sonner"

export default function SignInPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleSocialSignIn = async (provider: "github" | "google") => {
    setIsLoading(true)
    toast.info(`正在跳转到 ${provider} 登录...`)
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">登录</CardTitle>
          <CardDescription className="text-center">
            选择您的登录方式
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
              使用 GitHub 登录
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSocialSignIn("google")}
              disabled={isLoading}
            >
              <Mail className="mr-2 h-4 w-4" />
              使用 Google 登录
            </Button>
          </div>

          <div className="text-center text-sm">
            还没有账户？{" "}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => router.push("/sign-up")}
            >
              立即注册
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
