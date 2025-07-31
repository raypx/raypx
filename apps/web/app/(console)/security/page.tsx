"use client"

import { useSession } from "@raypx/auth/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { Key, Monitor, Shield, Smartphone } from "lucide-react"
import { ActiveSessions } from "./_components/active-sessions"
import { ChangePassword } from "./_components/change-password"
import { SecurityLog } from "./_components/security-log"
import { TwoFactorAuth } from "./_components/two-factor-auth"

export default function SecurityPage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return null
  }

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account security and authentication settings
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Password Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Password
            </CardTitle>
            <CardDescription>
              Change your password to keep your account secure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePassword />
          </CardContent>
        </Card>

        {/* Two-Factor Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TwoFactorAuth />
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Active Sessions
            </CardTitle>
            <CardDescription>
              Manage devices and sessions that are currently signed in
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActiveSessions />
          </CardContent>
        </Card>

        {/* Security Log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Log
            </CardTitle>
            <CardDescription>
              Recent security events and login attempts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SecurityLog />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
