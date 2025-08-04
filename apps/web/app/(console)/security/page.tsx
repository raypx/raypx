"use client"

import { Key, Monitor, Shield, Smartphone } from "lucide-react"
import { ConsolePage, ConsoleSection } from "@/layouts/console"
import { ActiveSessions } from "./_components/active-sessions"
import { ChangePassword } from "./_components/change-password"
import { SecurityLog } from "./_components/security-log"
import { TwoFactorAuth } from "./_components/two-factor-auth"

export default function SecurityPage() {
  return (
    <ConsolePage
      title="Security Settings"
      description="Manage your account security and authentication settings"
    >
      <div className="grid gap-6">
        <ConsoleSection
          title="Password"
          description="Change your password to keep your account secure"
          icon={Key}
        >
          <ChangePassword />
        </ConsoleSection>

        <ConsoleSection
          title="Two-Factor Authentication"
          description="Add an extra layer of security to your account"
          icon={Smartphone}
        >
          <TwoFactorAuth />
        </ConsoleSection>

        <ConsoleSection
          title="Active Sessions"
          description="Manage devices and sessions that are currently signed in"
          icon={Monitor}
        >
          <ActiveSessions />
        </ConsoleSection>

        <ConsoleSection
          title="Security Log"
          description="Recent security events and login attempts"
          icon={Shield}
        >
          <SecurityLog />
        </ConsoleSection>
      </div>
    </ConsolePage>
  )
}
