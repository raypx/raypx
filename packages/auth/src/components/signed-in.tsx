"use client"

import { useSession } from "@raypx/auth/client"
import type { ReactNode } from "react"

interface SignedInProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * SignedIn component renders its children only when the user is authenticated.
 * Optionally supports role-based access control.
 */
export function SignedIn({ children, fallback }: SignedInProps) {
  const { data: session, isPending } = useSession()

  if (isPending || !session?.user) {
    return fallback ? fallback : null
  }

  if (session.user?.banned) {
    return null
  }

  return <>{children}</>
}
