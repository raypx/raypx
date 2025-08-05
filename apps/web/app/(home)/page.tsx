import { createMetadata } from "@raypx/seo"
import type { Metadata } from "next"
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
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto">
          <h1 className="text-4xl font-bold">Raypx</h1>
        </div>
      </main>
      <Footer />
    </div>
  )
}
