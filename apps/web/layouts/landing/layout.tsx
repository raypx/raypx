import type { ReactNode } from "react"

export interface LandingLayoutProps {
  children: ReactNode
}

export function LandingLayout({ children }: LandingLayoutProps) {
  return (
    <div className="h-screen bg-background overflow-hidden">{children}</div>
  )
}
