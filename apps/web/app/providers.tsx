"use client"

import { AuthProvider, client } from "@raypx/auth/client"
import { AuthProvider as AuthProviderV2 } from "@raypx/auth-v2"
import { Provider } from "@raypx/ui/components/provider"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { authPages } from "@/config/auth.config"

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <Provider>
      <AuthProviderV2
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
        <AuthProvider
          authClient={client}
          pages={authPages}
          social={{
            providers: ["google", "github"],
          }}
        >
          {children}
        </AuthProvider>
      </AuthProviderV2>
    </Provider>
  )
}
