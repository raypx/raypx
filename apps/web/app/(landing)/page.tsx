"use client"

import { SignedIn, SignedOut, UserAvatar, useAuth } from "@raypx/auth/client"
import { Button } from "@raypx/ui/components/button"
import Link from "next/link"

function Header() {
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

function Footer() {
  return (
    <footer className="w-full border-t border-gray-200 px-6 py-4 mt-auto">
      <div className="max-w-7xl mx-auto text-center text-sm text-gray-600">
        © 2024 Raypx. All rights reserved.
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto">
          <h1 className="text-4xl font-bold">Raypx</h1>
        </div>
      </main>
      <Footer />
    </div>
  )
}
