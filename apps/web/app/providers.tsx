"use client"

import { AuthProvider } from "@raypx/auth"
import { client } from "@raypx/auth/client"
import { Provider } from "@raypx/ui/components/provider"
import { useRouter } from "next/navigation"
import { authPages } from "../config/auth.config"

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
        viewPaths={authPages}
        onSessionChange={() => {
          router.refresh()
        }}
      >
        {children}
      </AuthProvider>
    </Provider>
  )
}
