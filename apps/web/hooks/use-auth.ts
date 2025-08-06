"use client"

import { useTRPC } from "@raypx/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"

export const useAuthSession = () => {
  const trpc = useTRPC()
  const { data, isPending } = useSuspenseQuery(
    trpc.auth.getSession.queryOptions(),
  )
  return {
    session: data,
    isPending,
  }
}
