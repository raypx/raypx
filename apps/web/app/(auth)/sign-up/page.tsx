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

export default function SignUpPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleSocialSignUp = async (provider: "github" | "google") => {
    setIsLoading(true)
    toast.info(`正在跳转到 ${provider} 注册...`)
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">注册</CardTitle>
          <CardDescription className="text-center">
            选择您的注册方式
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
              使用 GitHub 注册
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSocialSignUp("google")}
              disabled={isLoading}
            >
              <Mail className="mr-2 h-4 w-4" />
              使用 Google 注册
            </Button>
          </div>

          <div className="text-center text-sm">
            已有账户？{" "}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => router.push("/sign-in")}
            >
              立即登录
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
