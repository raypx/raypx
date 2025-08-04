"use client"

import { useSession } from "@raypx/auth/client"
import type { ReactNode } from "react"

interface AuthLoadedProps {
  children: ReactNode
}

/**
 * AuthLoaded component renders its children only when the authentication session has finished loading.
 */
export function AuthLoaded({ children }: AuthLoadedProps) {
  const { isPending } = useSession()

  if (isPending) {
    return null
  }

  return <>{children}</>
}
