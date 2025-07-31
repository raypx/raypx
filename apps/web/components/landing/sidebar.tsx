"use client"

import { signOut, useSession } from "@raypx/auth/client"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@raypx/ui/components/avatar"
import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import {
  CreditCard,
  History,
  LogOut,
  MessageSquare,
  Plus,
  Shield,
  Sparkles,
  User,
} from "lucide-react"
import Link from "next/link"

export function Sidebar() {
  const session = useSession()

  if (session.isPending) {
    return (
      <div className="w-80 h-screen bg-background border-r p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-16 bg-muted rounded"></div>
          <div className="h-8 bg-muted rounded"></div>
          <div className="h-8 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  if (!session.data?.user) {
    return (
      <div className="w-72 h-screen bg-muted/20 border-r p-6 flex flex-col">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-3">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold">Raypx</h2>
          <p className="text-sm text-muted-foreground">AI Assistant</p>
        </div>

        <div className="bg-background rounded-lg p-6 mb-6 text-center shadow-sm">
          <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-semibold mb-2">Welcome!</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Sign in to start chatting with our AI assistant
          </p>
          <div className="space-y-2">
            <Button className="w-full" asChild>
              <Link href="/signin">Sign In</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/signup">Create Account</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground px-2">
            What you get:
          </h4>
          <div className="space-y-2">
            <div className="flex items-center text-sm bg-background/50 rounded-lg p-3">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span>AI-powered conversations</span>
            </div>
            <div className="flex items-center text-sm bg-background/50 rounded-lg p-3">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <span>Secure & private</span>
            </div>
            <div className="flex items-center text-sm bg-background/50 rounded-lg p-3">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                <History className="h-4 w-4 text-primary" />
              </div>
              <span>Chat history</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-72 h-screen bg-muted/20 border-r p-6 flex flex-col">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-3">
          <Sparkles className="h-6 w-6 text-primary-foreground" />
        </div>
        <h2 className="text-xl font-bold">Raypx</h2>
        <p className="text-sm text-muted-foreground">AI Assistant</p>
      </div>

      {/* User Info */}
      <div className="bg-background rounded-lg p-6 mb-6 shadow-sm">
        <div className="text-center mb-4">
          <Avatar className="h-16 w-16 mx-auto mb-3 ring-2 ring-primary/20">
            <AvatarImage src={session.data.user.image || ""} />
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-lg font-semibold">
              {session.data.user.name?.charAt(0) ||
                session.data.user.email?.charAt(0) ||
                "U"}
            </AvatarFallback>
          </Avatar>
          <h3 className="font-semibold text-lg truncate">
            {session.data.user.name || "User"}
          </h3>
          <p className="text-sm text-muted-foreground truncate mb-3">
            {session.data.user.email}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Free Plan
            </Badge>
            <Button size="sm" variant="outline" className="text-xs h-7" asChild>
              <Link href="/console/billing">
                <Plus className="h-3 w-3 mr-1" />
                Upgrade
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 space-y-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 px-2">
            Chat
          </h4>
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start text-left bg-background/50 hover:bg-background rounded-lg"
              asChild
            >
              <Link href="/">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                New Chat
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-left bg-background/50 hover:bg-background rounded-lg"
              asChild
            >
              <Link href="/history">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                  <History className="h-4 w-4 text-primary" />
                </div>
                Chat History
              </Link>
            </Button>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 px-2">
            Account
          </h4>
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start text-left bg-background/50 hover:bg-background rounded-lg"
              asChild
            >
              <Link href="/console/profile">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                  <User className="h-4 w-4 text-primary" />
                </div>
                Profile
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-left bg-background/50 hover:bg-background rounded-lg"
              asChild
            >
              <Link href="/console/billing">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                Billing
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-left bg-background/50 hover:bg-background rounded-lg"
              asChild
            >
              <Link href="/console/security">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center mr-3">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                Security
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4">
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
          onClick={() => signOut()}
        >
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
            <LogOut className="h-4 w-4 text-red-600" />
          </div>
          Sign Out
        </Button>
      </div>
    </div>
  )
}
