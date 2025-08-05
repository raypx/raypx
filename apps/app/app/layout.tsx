import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"
import "../styles/globals.css"
import { AnalyticsProvider } from "@raypx/analytics"
import { AuthProvider, GoogleOneTap } from "@raypx/auth/client"
import { Provider } from "@raypx/ui/components/provider"
import { Toaster } from "@raypx/ui/components/toast"
import authConfig from "@/config/auth.config"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

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
        <Provider>
          <AuthProvider config={authConfig}>
            <AnalyticsProvider>
              {children}
              <Toaster />
              <GoogleOneTap />
            </AnalyticsProvider>
          </AuthProvider>
        </Provider>
      </body>
    </html>
  )
}
