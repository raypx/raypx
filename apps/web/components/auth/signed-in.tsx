"use client"

import { useSession } from "@raypx/auth/client"
import type { ReactNode } from "react"

interface SignedInProps {
  children: ReactNode
  fallback?: ReactNode
  requireRole?: string | string[]
}

/**
 * SignedIn component renders its children only when the user is authenticated.
 * Optionally supports role-based access control.
 */
export function SignedIn({ children, fallback, requireRole }: SignedInProps) {
  const { data: session, isPending } = useSession()

  if (isPending || !session?.user) {
    return fallback ? fallback : null
  }

  // Role-based access control
  if (requireRole && session.user) {
    const userRoles =
      (session.user as any).role || (session.user as any).roles || []
    const roles = Array.isArray(requireRole) ? requireRole : [requireRole]
    const hasRequiredRole = roles.some((role) =>
      Array.isArray(userRoles) ? userRoles.includes(role) : userRoles === role,
    )

    if (!hasRequiredRole) {
      return fallback ? fallback : null
    }
  }

  return <>{children}</>
}
