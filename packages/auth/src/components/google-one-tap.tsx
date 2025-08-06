"use client"

import { toast } from "@raypx/ui/components/toast"
import { useContext, useEffect, useRef } from "react"
import { useOnSuccessTransition } from "../hooks/use-success-transition"
import { AuthContext } from "./auth-provider"

interface OneTapProps {
  redirectTo?: string
}

export function GoogleOneTap({ redirectTo }: OneTapProps) {
  const { authClient } = useContext(AuthContext)
  const oneTapFetched = useRef(false)

  const { onSuccess } = useOnSuccessTransition({ redirectTo })

  useEffect(() => {
    if (oneTapFetched.current) return
    oneTapFetched.current = true

    try {
      authClient.oneTap({
        fetchOptions: {
          throw: true,
          onSuccess,
        },
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An unknown error occurred",
      )
    }
  }, [authClient, onSuccess, toast])

  return null
}
