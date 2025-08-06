"use client"

import { CardContent } from "@raypx/ui/components/card"
import { Skeleton } from "@raypx/ui/components/skeleton"
import { cn } from "@raypx/ui/lib/utils"
import { useContext } from "react"
import type { Refetch } from "../types/refetch"
import { AuthContext } from "./auth-provider"
import { ProviderCell } from "./provider-cell"
import { socialProviders } from "./social-providers"

export interface ProvidersCardProps {
  className?: string
  accounts?: { accountId: string; provider: string }[] | null
  isPending?: boolean
  skipHook?: boolean
  refetch?: Refetch
}

export function ProvidersCard({
  accounts,
  isPending,
  skipHook,
  refetch,
}: ProvidersCardProps) {
  const {
    hooks: { useListAccounts },
    social,
    genericOAuth,
  } = useContext(AuthContext)

  if (!skipHook) {
    const result = useListAccounts()
    accounts = result.data
    isPending = result.isPending
    refetch = result.refetch
  }

  return (
    <CardContent className={cn("grid gap-4")}>
      {isPending ? (
        social?.providers?.map((provider) => <Skeleton key={provider} />)
      ) : (
        <>
          {social?.providers?.map((provider) => {
            const socialProvider = socialProviders.find(
              (socialProvider) => socialProvider.provider === provider,
            )

            if (!socialProvider) return null

            return (
              <ProviderCell
                key={provider}
                account={accounts?.find((acc) => acc.provider === provider)}
                provider={socialProvider}
                refetch={refetch}
              />
            )
          })}

          {genericOAuth?.providers?.map((provider) => (
            <ProviderCell
              key={provider.provider}
              account={accounts?.find(
                (acc) => acc.provider === provider.provider,
              )}
              provider={provider}
              refetch={refetch}
              other
            />
          ))}
        </>
      )}
    </CardContent>
  )
}
