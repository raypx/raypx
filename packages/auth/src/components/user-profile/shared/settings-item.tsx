"use client"

import type { ButtonProps } from "@raypx/ui/components/button"
import { Button } from "@raypx/ui/components/button"
import type React from "react"

interface SettingsItemProps {
  title: string
  description?: string
  children?: React.ReactNode
  action?: {
    label: string
    onClick?: () => void
    variant?: ButtonProps["variant"]
    size?: ButtonProps["size"]
    disabled?: boolean
  }
  className?: string
  variant?: "default" | "danger"
}

export function SettingsItem({
  title,
  description,
  children,
  action,
  className = "",
  variant = "default",
}: SettingsItemProps) {
  const borderClass = variant === "danger" ? "border-red-200" : "border"

  return (
    <div
      className={`flex items-center justify-between p-4 ${borderClass} rounded-lg ${className}`}
    >
      <div className="flex-1 space-y-1">
        <p
          className={`text-sm font-medium ${variant === "danger" ? "text-red-600" : ""}`}
        >
          {title}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
      {action && (
        <Button
          variant={action.variant || "outline"}
          size={action.size || "sm"}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
