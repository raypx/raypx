import type { createAuthClient } from "better-auth/react"

type CreateAuthClient = ReturnType<typeof createAuthClient>

export type AnyAuthClient = Omit<CreateAuthClient, "signUp" | "getSession">
