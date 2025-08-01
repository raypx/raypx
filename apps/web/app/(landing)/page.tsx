"use client"

import { Button } from "@raypx/ui/components/button"
import Link from "next/link"
import { SignedIn, SignedOut, UserAvatar } from "@/components/auth"
import authConfig from "@/config/auth.config"

function Header() {
  return (
    <header className="w-full bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl font-semibold">Raypx</h1>
        <SignedIn>
          <UserAvatar />
        </SignedIn>
        <SignedOut>
          <Link href={authConfig.signIn}>
            <Button>Sign in</Button>
          </Link>
          <Link href={authConfig.signUp}>
            <Button>Sign up</Button>
          </Link>
        </SignedOut>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="w-full bg-white border-t border-gray-200 px-6 py-4 mt-auto">
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
