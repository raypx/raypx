"use client"

import { ChevronRight, Home } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { UserAvatar } from "@/app/_components/user-avatar"
import { ProtectedRoute } from "@/components/auth"
import authConfig from "@/config/auth.config"

interface ConsoleLayoutProps {
  children: ReactNode
}

export default function ConsoleLayout({ children }: ConsoleLayoutProps) {
  return (
    <ProtectedRoute
      loading={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading console...</p>
          </div>
        </div>
      }
      redirectTo={authConfig.signIn}
    >
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card" role="banner">
          <div className="container mx-auto px-6 py-4">
            <nav
              className="flex items-center justify-between"
              role="navigation"
              aria-label="Console navigation"
            >
              <div className="flex items-center space-x-6">
                <h1 className="text-xl font-semibold">Console</h1>
                <div className="hidden md:flex space-x-4">
                  <Link
                    href="/console"
                    className="text-sm hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded px-2 py-1"
                    aria-label="Go to console dashboard"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/profile"
                    className="text-sm hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded px-2 py-1"
                    aria-label="Go to profile page"
                  >
                    Profile
                  </Link>
                </div>
              </div>
              <UserAvatar />
            </nav>
          </div>
        </header>
        <div className="border-b bg-muted/50">
          <div className="container mx-auto px-6 py-2">
            <nav
              className="flex items-center space-x-1 text-sm text-muted-foreground"
              aria-label="Breadcrumb"
            >
              <Link
                href="/"
                className="flex items-center hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                aria-label="Go to home page"
              >
                <Home className="h-4 w-4" />
              </Link>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <span className="text-foreground" aria-current="location">
                Console
              </span>
            </nav>
          </div>
        </div>
        <main className="container mx-auto px-6 py-8" role="main">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
