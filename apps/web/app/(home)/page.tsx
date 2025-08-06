import { createMetadata } from "@raypx/seo"
import { HydrateClient, prefetch, trpc } from "@raypx/trpc/server"
import type { Metadata } from "next"
import { Suspense } from "react"
import appConfig from "@/config/app.config"
import { Footer } from "./_components/footer"
import { Header } from "./_components/header"

export const generateMetadata = async (): Promise<Metadata> => {
  return createMetadata({
    title: appConfig.name,
    description: appConfig.description,
  })
}

export default function LandingPage() {
  prefetch(trpc.user.all.queryOptions())
  return (
    <HydrateClient>
      <div className="min-h-screen flex flex-col">
        <Suspense fallback={<div>Loading...</div>}>
          <Header />
        </Suspense>
        <main className="flex-1">
          <div className="container mx-auto">
            <h1 className="text-4xl font-bold">Raypx</h1>
          </div>
        </main>
        <Footer />
      </div>
    </HydrateClient>
  )
}
