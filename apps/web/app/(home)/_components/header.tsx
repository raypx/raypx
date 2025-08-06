"use client"

import { SignedIn, SignedOut, UserAvatar, useAuth } from "@raypx/auth/client"
import { useTRPC } from "@raypx/trpc/client"
import { Button } from "@raypx/ui/components/button"
import { useSuspenseQuery } from "@tanstack/react-query"
import Link from "next/link"

export function Header() {
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(trpc.user.all.queryOptions())
  const { config: authConfig } = useAuth()
  return (
    <header className="w-full border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/">
          <h1 className="text-xl font-semibold">Raypx</h1>
        </Link>
        <SignedIn>
          <UserAvatar />
        </SignedIn>
        {JSON.stringify(data)}
        <SignedOut>
          <div>
            <Link href={authConfig.signIn}>
              <Button>Sign in</Button>
            </Link>
            <Link href={authConfig.signUp}>
              <Button>Sign up</Button>
            </Link>
          </div>
        </SignedOut>
      </div>
    </header>
  )
}
