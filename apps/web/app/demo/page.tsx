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
          <h1 className="text-4xl font-bold mb-4">
            Authentication System Demo
          </h1>
          <p className="text-lg text-gray-600">
            This is a complete implementation of a user authentication system
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Login Page</CardTitle>
              <CardDescription>
                User login interface, supports social login
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/sign-in">
                <Button className="w-full">View login page</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sign Up Page</CardTitle>
              <CardDescription>
                User registration interface, supports social registration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/sign-up">
                <Button className="w-full">View sign up page</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Dashboard</CardTitle>
              <CardDescription>User dashboard after login</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard">
                <Button className="w-full">View dashboard</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tech Stack</CardTitle>
              <CardDescription>
                The technologies and frameworks used
              </CardDescription>
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
              <CardTitle>Features</CardTitle>
              <CardDescription>Implemented features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>• Social login (GitHub, Google)</div>
                <div>• User session management</div>
                <div>• Responsive design</div>
                <div>• Modern UI</div>
                <div>• Type safety</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Setup Instructions</CardTitle>
              <CardDescription>How to configure and run</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>1. Copy env.example to .env.local</div>
                <div>2. Configure database and Redis</div>
                <div>3. Set up OAuth applications</div>
                <div>4. Run pnpm dev</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 p-6 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Next Steps</h3>
          <p className="text-gray-700 mb-4">
            To fully enable authentication, you need to:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            <li>Set up PostgreSQL database</li>
            <li>Configure Redis cache</li>
            <li>Create GitHub/Google OAuth applications</li>
            <li>Configure email service (Resend)</li>
            <li>Update environment variables</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
