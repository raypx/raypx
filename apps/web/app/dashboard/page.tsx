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
      toast.success("已退出登录")
      router.push("/sign-in")
    } catch (_error) {
      toast.error("退出登录失败")
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
          <h1 className="text-3xl font-bold">仪表板</h1>
          <Button onClick={handleSignOut} variant="outline">
            退出登录
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>欢迎回来！</CardTitle>
              <CardDescription>您已成功登录系统</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                邮箱: {session.user?.email}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>账户信息</CardTitle>
              <CardDescription>查看您的账户详情</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                用户ID: {session.user?.id}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>快速操作</CardTitle>
              <CardDescription>常用功能</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button className="w-full" variant="outline">
                  个人设置
                </Button>
                <Button className="w-full" variant="outline">
                  安全设置
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
