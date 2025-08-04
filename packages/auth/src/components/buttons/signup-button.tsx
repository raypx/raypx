"use client"

import { signUp } from "@raypx/auth/client"
import type { ButtonHTMLAttributes } from "react"

interface SignUpButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  mode?: "modal" | "redirect"
  redirectUrl?: string
  fallbackRedirectUrl?: string
}

export function SignUpButton({
  children = "Sign Up",
  mode = "redirect",
  redirectUrl,
  fallbackRedirectUrl = "/",
  onClick,
  ...props
}: SignUpButtonProps) {
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e)
    }

    if (mode === "redirect") {
      await signUp.email({
        email: "",
        password: "",
        name: "",
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
