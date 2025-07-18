import { RootProvider } from "fumadocs-ui/provider"
import { Inter } from "next/font/google"
import type { ReactNode } from "react"
import "@/styles/globals.css"
import type { Metadata } from "next"
import appConfig from "@/config/app.config"

const inter = Inter({
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

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
