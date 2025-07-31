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
    const userRoles =
      (session.user as any).role || (session.user as any).roles || []
    const roles = Array.isArray(requireRole) ? requireRole : [requireRole]
    const hasRequiredRole = roles.some((role) =>
      Array.isArray(userRoles) ? userRoles.includes(role) : userRoles === role,
    )

    if (!hasRequiredRole) {
      return fallback ? (
        fallback
      ) : (
        <div>Access denied: insufficient permissions</div>
      )
    }
  }

  return <>{children}</>
}
