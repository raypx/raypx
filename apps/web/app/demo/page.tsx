"use client"

import { Button } from "@raypx/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import Link from "next/link"

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">认证系统演示</h1>
          <p className="text-lg text-gray-600">
            这是一个完整的用户认证系统实现
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>登录页面</CardTitle>
              <CardDescription>用户登录界面，支持社交登录</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/sign-in">
                <Button className="w-full">查看登录页面</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>注册页面</CardTitle>
              <CardDescription>用户注册界面，支持社交注册</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/sign-up">
                <Button className="w-full">查看注册页面</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>用户仪表板</CardTitle>
              <CardDescription>登录后的用户仪表板</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard">
                <Button className="w-full">查看仪表板</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>技术栈</CardTitle>
              <CardDescription>使用的技术和框架</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>• Next.js 15</div>
                <div>• BetterAuth</div>
                <div>• Radix UI</div>
                <div>• Tailwind CSS</div>
                <div>• TypeScript</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>功能特性</CardTitle>
              <CardDescription>已实现的功能</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>• 社交登录 (GitHub, Google)</div>
                <div>• 用户会话管理</div>
                <div>• 响应式设计</div>
                <div>• 现代化 UI</div>
                <div>• 类型安全</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>设置说明</CardTitle>
              <CardDescription>如何配置和运行</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>1. 复制 env.example 为 .env.local</div>
                <div>2. 配置数据库和 Redis</div>
                <div>3. 设置 OAuth 应用</div>
                <div>4. 运行 pnpm dev</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 p-6 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">下一步</h3>
          <p className="text-gray-700 mb-4">要完全启用认证功能，您需要：</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            <li>设置 PostgreSQL 数据库</li>
            <li>配置 Redis 缓存</li>
            <li>创建 GitHub/Google OAuth 应用</li>
            <li>配置邮箱服务 (Resend)</li>
            <li>更新环境变量</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
