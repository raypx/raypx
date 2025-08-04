"use client"

import { signOut } from "@raypx/auth/client"
import type { ButtonHTMLAttributes } from "react"

interface SignOutButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  redirectUrl?: string
}

export function SignOutButton({
  children = "Sign Out",
  redirectUrl = "/",
  onClick,
  ...props
}: SignOutButtonProps) {
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e)
    }

    await signOut()
    window.location.href = redirectUrl
  }

  return (
    <button onClick={handleClick} {...props}>
      {children}
    </button>
  )
}
