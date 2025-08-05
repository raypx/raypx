"use client"

import { ChangePassword as ChangePasswordDialog } from "@/components/change-password"

export function ChangePassword() {
  return (
    <div className="max-w-md">
      <p className="text-sm text-muted-foreground mb-4">
        Keep your account secure by regularly updating your password.
      </p>
      <ChangePasswordDialog />
    </div>
  )
}
