"use client"

import type { Session, User, UseSessionResult } from "../types"

export interface AuthState {
  isLoaded: boolean
  isSignedIn: boolean
  user: User
  session: Session | null
}

export function createAuthState(session: UseSessionResult): AuthState {
  const isLoaded = !session?.isPending
  const user = (
    session?.data && "user" in session.data ? session.data.user : null
  ) as User
  const isSignedIn = !!user

  return {
    isLoaded,
    isSignedIn,
    user,
    session: isLoaded ? session?.data : null,
  }
}

export function isAuthLoaded(state: AuthState): boolean {
  return state.isLoaded
}

export function isUserSignedIn(state: AuthState): boolean {
  return state.isSignedIn && !!state.user
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return ""
  return user.name || user.email || "User"
}

export function getUserInitials(user: User | null): string {
  if (!user) return ""
  const name = getUserDisplayName(user)
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}
