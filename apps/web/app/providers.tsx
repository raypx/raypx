"use client"

import { AuthProvider } from "@raypx/auth"
import { client } from "@raypx/auth/client"
import { Provider } from "@raypx/ui/components/provider"
import Link from "next/link"
import { useRouter } from "next/navigation"

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <Provider>
      <AuthProvider
        authClient={client}
        social={{
          providers: ["google", "github"],
        }}
        navigate={router.push}
        replace={router.replace}
        onSessionChange={() => {
          // Clear router cache (protected routes)
          router.refresh()
        }}
        Link={Link}
      >
        {children}
      </AuthProvider>
    </Provider>
  )
}
