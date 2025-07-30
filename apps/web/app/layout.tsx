import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"
import "../styles/globals.css"
import { AnalyticsProvider } from "@raypx/analytics"
import { Provider } from "@raypx/ui/components/provider"
import { Toaster } from "@raypx/ui/components/toast"
import appConfig from "@/config/app.config"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: appConfig.name,
  description: appConfig.description,
  keywords: appConfig.keywords,
  metadataBase: new URL(appConfig.url),
  openGraph: {
    title: appConfig.name,
    description: appConfig.description,
    url: appConfig.url,
    siteName: appConfig.name,
  },
}

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
          <AnalyticsProvider>
            {children}
            <Toaster />
          </AnalyticsProvider>
        </Provider>
      </body>
    </html>
  )
}
