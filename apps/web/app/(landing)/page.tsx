import { MainChat } from "@/components/landing/main-chat"
import { Sidebar } from "@/components/landing/sidebar"

export default function LandingPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <MainChat />
    </div>
  )
}
