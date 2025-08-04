"use client"

import { signIn } from "@raypx/auth/client"
import type { ButtonHTMLAttributes } from "react"

interface SignInButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  mode?: "modal" | "redirect"
  redirectUrl?: string
  fallbackRedirectUrl?: string
}

export function SignInButton({
  children = "Sign In",
  mode = "redirect",
  redirectUrl,
  fallbackRedirectUrl = "/",
  onClick,
  ...props
}: SignInButtonProps) {
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e)
    }

    if (mode === "redirect") {
      await signIn.email({
        email: "",
        password: "",
        callbackURL: redirectUrl || fallbackRedirectUrl,
      })
    }
  }

  return (
    <button onClick={handleClick} {...props}>
      {children}
    </button>
  )
}
