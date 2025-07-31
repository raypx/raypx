"use client"

import { useSession } from "@raypx/auth/client"
import type { ReactNode } from "react"
import { RedirectToSignIn } from "./redirect-to-signin"

interface ProtectedRouteProps {
  children: ReactNode
  fallback?: ReactNode
  requireRole?: string | string[]
  redirectTo?: string
  loading?: ReactNode
  onRedirect?: () => void
}

// Define proper user type with roles
interface UserWithRoles {
  role?: string | string[]
  roles?: string | string[]
}

function hasUserRole(
  userWithRoles: UserWithRoles,
  roleToCheck: string,
): boolean {
  const userRoles = userWithRoles.role || userWithRoles.roles || []
  return Array.isArray(userRoles)
    ? userRoles.includes(roleToCheck)
    : userRoles === roleToCheck
}

/**
 * ProtectedRoute component that combines authentication check with automatic redirect.
 * Provides a convenient wrapper for protecting entire routes.
 */
export function ProtectedRoute({
  children,
  fallback,
  requireRole,
  redirectTo,
  loading,
  onRedirect,
}: ProtectedRouteProps) {
  const { data: session, isPending } = useSession()

  // Show loading state while checking authentication
  if (isPending) {
    return loading ? loading : null
  }

  // If user is not authenticated, redirect to sign in
  if (!session?.user) {
    if (fallback) {
      return <>{fallback}</>
    }
    return <RedirectToSignIn returnUrl={redirectTo} onRedirect={onRedirect} />
  }

  // Role-based access control
  if (requireRole && session.user) {
    const user = session.user as UserWithRoles
    const roles = Array.isArray(requireRole) ? requireRole : [requireRole]
    const hasRequiredRole = roles.some((role) => hasUserRole(user, role))

    if (!hasRequiredRole) {
      return fallback ? fallback : null
    }
  }

  return <>{children}</>
}
