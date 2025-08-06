"use client"

import { useAuth, useSession } from "@raypx/auth/client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

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
  const { pages } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isPending && !session?.user) {
      const redirectUrl = new URL(pages.SIGN_IN, window.location.origin)
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
  }, [session, isPending, router, returnUrl, onRedirect, pages.SIGN_IN])

  return null
}
