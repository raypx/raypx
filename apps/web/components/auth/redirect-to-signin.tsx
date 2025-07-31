"use client"

import { useSession } from "@raypx/auth/client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import authConfig from "../../config/auth.config"

interface RedirectToSignInProps {
  returnUrl?: string
  onRedirect?: () => void
}

/**
 * RedirectToSignIn component redirects unauthenticated users to the sign-in page.
 */
export function RedirectToSignIn({
  returnUrl,
  onRedirect,
}: RedirectToSignInProps) {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!isPending && !session?.user) {
      const redirectUrl = new URL(authConfig.signIn, window.location.origin)
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
