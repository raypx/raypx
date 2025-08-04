"use client"

import { useAuth, useSession } from "@raypx/auth/client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

interface RedirectToSignUpProps {
  returnUrl?: string
  onRedirect?: () => void
}

/**
 * RedirectToSignUp component redirects unauthenticated users to the sign-up page.
 */
export function RedirectToSignUp({
  returnUrl,
  onRedirect,
}: RedirectToSignUpProps) {
  const { data: session, isPending } = useSession()
  const { config } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isPending && !session?.user) {
      const redirectUrl = new URL(config.signUp, window.location.origin)
      if (returnUrl) {
        redirectUrl.searchParams.set("redirect", returnUrl)
      } else if (typeof window !== "undefined") {
        redirectUrl.searchParams.set(
          "redirect",
          window.location.pathname + window.location.search,
        )
      }
      onRedirect?.()
      router.push(redirectUrl.toString())
    }
  }, [session, isPending, router, returnUrl, onRedirect, config.signUp])

  return null
}
