"use client"

import { Separator } from "@raypx/ui/components/separator"
import { Clock, Wifi } from "lucide-react"
import ChangePasswordDialog from "./change-password-dialog"
import { SettingsItem } from "./shared/settings-item"

export default function SecurityTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="text-base font-medium">Password Management</h4>
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <p className="text-sm font-medium">Login Password</p>
            <p className="text-xs text-muted-foreground">
              Last modified: 2024-01-15
            </p>
          </div>
          <ChangePasswordDialog />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="text-base font-medium">Two-Factor Authentication</h4>
        <div className="space-y-3">
          <SettingsItem
            title="SMS Verification"
            description="Receive verification codes via SMS"
            action={{
              label: "Enable",
              onClick: () => console.log("Enable SMS 2FA"),
            }}
          />
          <SettingsItem
            title="Authenticator App"
            description="Generate verification codes using an authenticator app"
            action={{
              label: "Setup",
              onClick: () => console.log("Setup authenticator app"),
            }}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="text-base font-medium">Login History</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Wifi className="size-4" />
              <span>Current Session - MacBook Pro</span>
            </div>
            <span className="text-muted-foreground">Beijing, China</span>
          </div>
          <div className="flex items-center justify-between text-sm p-3 border rounded-lg">
            <div className="flex items-center space-x-2">
              <Clock className="size-4" />
              <span>iPhone 15 Pro</span>
            </div>
            <span className="text-muted-foreground">2 hours ago</span>
          </div>
        </div>
      </div>
    </div>
  )
}
