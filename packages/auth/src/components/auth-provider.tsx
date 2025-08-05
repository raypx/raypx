"use client"

import { useSession } from "@raypx/auth/client"
import { AuthContext } from "./hooks"
import type { AuthConfig } from "./types"
import { AuthConfigSchema } from "./types"

export interface AuthProviderProps {
  children: React.ReactNode
  config: AuthConfig
}

export type { AuthConfig }
export { AuthConfigSchema }

export function AuthProvider({ children, config }: AuthProviderProps) {
  const { data: session } = useSession()

  return (
    <AuthContext.Provider
      value={{ session: session?.session, user: session?.user, config }}
    >
      {children}
    </AuthContext.Provider>
  )
}
