import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"
import "../styles/globals.css"
import { AnalyticsProvider } from "@raypx/analytics"
import { GoogleOneTap } from "@raypx/auth/client"
import { TRPCReactProvider } from "@raypx/trpc/client"
import { Toaster } from "@raypx/ui/components/toast"
import { Providers } from "./providers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const dynamic = "force-dynamic"

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <AnalyticsProvider>
            <TRPCReactProvider>{children}</TRPCReactProvider>
            <Toaster />
            <GoogleOneTap />
          </AnalyticsProvider>
        </Providers>
      </body>
    </html>
  )
}
