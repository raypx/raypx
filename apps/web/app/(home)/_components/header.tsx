"use client"

import { UserButton } from "@raypx/auth"
import { useAuth } from "@raypx/auth/client"
import { Button } from "@raypx/ui/components/button"
import Image from "next/image"
import Link from "next/link"

export function Header() {
  const {
    viewPaths: pages,
    hooks: { useSession },
  } = useAuth()
  const { data: session } = useSession()

  return (
    <header className="w-full border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/">
          <h1 className="text-xl font-semibold">
            <Image
              src="/images/logo.png"
              alt="Raypx"
              className="size-8 rounded-full"
              width={40}
              height={40}
            />
          </h1>
        </Link>
        {session?.session ? (
          <UserButton size="icon" />
        ) : (
          <div className="flex items-center gap-2">
            <Link href={pages.SIGN_IN}>
              <Button variant="outline">Sign in</Button>
            </Link>
            <Link href={pages.SIGN_UP}>
              <Button>Get started</Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
