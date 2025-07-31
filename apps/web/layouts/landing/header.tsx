import { Button } from "@raypx/ui/components/button"
import Link from "next/link"
import { SignedIn, SignedOut, UserAvatar } from "@/components/auth"
import appConfig from "@/config/app.config"

export interface HeaderProps {
  showNavigation?: boolean
}

const navigationItems: { href: string; label: string }[] = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#about", label: "About" },
]

export function Header({ showNavigation = true }: HeaderProps) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center space-x-2">
          <Link href="/" className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-full bg-primary" />
            <span className="text-xl font-bold">{appConfig.name}</span>
          </Link>
        </div>

        {showNavigation && (
          <nav className="hidden md:flex items-center space-x-6">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center space-x-2">
          <SignedOut>
            <Button variant="ghost" asChild>
              <Link href="/signin">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <UserAvatar />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
