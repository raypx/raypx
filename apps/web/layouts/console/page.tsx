"use client"

import { useSession } from "@raypx/auth/client"
import type { ReactNode } from "react"

export interface ConsolePageProps {
  children: ReactNode
  title: string
  description?: string
  className?: string
  maxWidth?: "4xl" | "6xl" | "full"
}

export function ConsolePage({
  children,
  title,
  description,
  className = "",
  maxWidth = "4xl",
}: ConsolePageProps) {
  const { data: session } = useSession()

  if (!session?.user) {
    return null
  }

  const maxWidthClass = {
    "4xl": "max-w-4xl",
    "6xl": "max-w-6xl",
    full: "max-w-full",
  }[maxWidth]

  return (
    <div
      className={`container mx-auto ${maxWidthClass} p-6 space-y-6 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
