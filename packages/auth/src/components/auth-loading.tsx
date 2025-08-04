"use client"

import { useSession } from "@raypx/auth/client"
import type { ReactNode } from "react"

interface AuthLoadingProps {
  children?: ReactNode
  fallback?: ReactNode
}

/**
 * AuthLoading component renders its children only when the authentication session is loading.
 */
export function AuthLoading({ children, fallback }: AuthLoadingProps) {
  const { isPending } = useSession()

  if (!isPending) {
    return fallback ? fallback : null
  }

  return <>{children}</>
}
