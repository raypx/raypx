"use client"

import { AuthProvider, client } from "@raypx/auth/client"
import { Provider } from "@raypx/ui/components/provider"
import { authPages } from "@/config/auth.config"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider>
      <AuthProvider
        authClient={client}
        pages={authPages}
        social={{
          providers: ["google", "github"],
        }}
      >
        {children}
      </AuthProvider>
    </Provider>
  )
}
