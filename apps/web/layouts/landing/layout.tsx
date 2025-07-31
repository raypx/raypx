import type { ReactNode } from "react"
import { Footer } from "./footer"
import { Header } from "./header"

export interface LandingLayoutProps {
  children: ReactNode
}

export function LandingLayout({ children }: LandingLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
