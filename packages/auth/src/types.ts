import type { AsyncReturnType, Get } from "type-fest"
import type { listSessions, useSession } from "./client"

export type UseSessionResult = ReturnType<typeof useSession>

export type ListSessionsResult = AsyncReturnType<typeof listSessions>

export type Session = UseSessionResult["data"]
export type User = Get<Session, "user">

export interface ChangePasswordOptions {
  currentPassword: string
  newPassword: string
}

export interface SignInOptions {
  redirectUrl?: string
  mode?: "modal" | "redirect"
}

export interface SignUpOptions {
  redirectUrl?: string
  mode?: "modal" | "redirect"
}

export interface SignOutOptions {
  redirectUrl?: string
}
