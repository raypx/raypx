"use client"

import { useSession } from "@raypx/auth/client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import authConfig from "../../config/auth.config"

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
  const router = useRouter()

  useEffect(() => {
    if (!isPending && !session?.user) {
      const redirectUrl = new URL(authConfig.signUp, window.location.origin)
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
  }, [session, isPending, router, returnUrl, onRedirect])

  return null
}
