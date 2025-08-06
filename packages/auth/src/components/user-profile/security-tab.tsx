"use client"

import ChangePasswordDialog from "./change-password-dialog"

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
    </div>
  )
}
