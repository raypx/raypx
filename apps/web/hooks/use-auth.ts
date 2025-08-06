"use client"

import { $store } from "@raypx/auth/client"
import { useTRPC } from "@raypx/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useEffect } from "react"

export const useAuthSession = () => {
  const trpc = useTRPC()
  const { data, isPending, refetch } = useSuspenseQuery(
    trpc?.auth?.getSession?.queryOptions(),
  )

  useEffect(() => {
    $store.listen("$sessionSignal", (value) => {
      console.log("sessionSignal", value)
      refetch()
    })
  }, [])

  return {
    session: data,
    isPending,
    refetch,
  }
}
