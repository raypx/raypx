import type { ReactNode } from "react"
import { Footer, type FooterProps } from "./footer"
import { Header, type HeaderProps } from "./header"

export interface LandingLayoutProps {
  children: ReactNode
  headerProps?: HeaderProps
  footerProps?: FooterProps
}

export function LandingLayout({
  children,
  headerProps,
  footerProps,
}: LandingLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header {...headerProps} />
      <main>{children}</main>
      <Footer {...footerProps} />
    </div>
  )
}
