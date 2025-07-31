"use client"

import { useSession } from "@raypx/auth/client"
import type { ReactNode } from "react"

interface SignedOutProps {
  children: ReactNode
}

/**
 * SignedOut component renders its children only when the user is not authenticated.
 */
export function SignedOut({ children }: SignedOutProps) {
  const { data: session, isPending } = useSession()

  if (isPending || session?.user) {
    return null
  }

  return <>{children}</>
}
