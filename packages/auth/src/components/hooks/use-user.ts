"use client"

import { useSession } from "@raypx/auth/client"
import type { User } from "@raypx/auth/types"
import { createAuthState } from "../../utils/auth-state"

export function useUser() {
  const session = useSession()
  const authState = createAuthState(session)

  return {
    user: authState.user as User | null,
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
  }
}
