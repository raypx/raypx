"use client"

import { Button } from "@raypx/ui/components/button"
import { Card } from "@raypx/ui/components/card"
import { toast } from "@raypx/ui/components/toast"
import { cn } from "@raypx/ui/lib/utils"
import type { SocialProvider } from "better-auth/social-providers"
import { Loader2 } from "lucide-react"
import { useContext, useState } from "react"
import type { Refetch } from "../types/refetch"
import { AuthContext } from "./auth-provider"
import type { SocialProvider as Provider } from "./social-providers"

export interface ProviderCellProps {
  className?: string
  account?: { accountId: string; provider: string } | null
  isPending?: boolean
  other?: boolean
  provider: Provider
  refetch?: Refetch
}

export function ProviderCell({
  className,
  account,
  other,
  provider,
  refetch,
}: ProviderCellProps) {
  const {
    authClient,
    basePath,
    baseURL,
    mutators: { unlinkAccount },
    pages,
  } = useContext(AuthContext)

  const [isLoading, setIsLoading] = useState(false)

  const handleLink = async () => {
    setIsLoading(true)
    const callbackURL = `${baseURL}${basePath}/${pages.CALLBACK}?redirectTo=${window.location.pathname}`

    try {
      if (other) {
        await authClient.oauth2.link({
          providerId: provider.provider as SocialProvider,
          callbackURL,
          fetchOptions: { throw: true },
        })
      } else {
        await authClient.linkSocial({
          provider: provider.provider as SocialProvider,
          callbackURL,
          fetchOptions: { throw: true },
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unknown error")
      setIsLoading(false)
    }
  }

  const handleUnlink = async () => {
    setIsLoading(true)

    try {
      await unlinkAccount({
        accountId: account?.accountId,
        providerId: provider.provider,
      })

      await refetch?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unknown error")
    }

    setIsLoading(false)
  }

  return (
    <Card className={cn("flex-row items-center gap-3 px-4 py-3", className)}>
      {provider.icon && <provider.icon className={cn("size-4")} />}

      <span className="text-sm">{provider.name}</span>

      <Button
        className={cn("relative ms-auto")}
        disabled={isLoading}
        size="sm"
        type="button"
        variant={account ? "outline" : "default"}
        onClick={account ? handleUnlink : handleLink}
      >
        {isLoading && <Loader2 className="animate-spin" />}
        {account ? "Unlink" : "Link"}
      </Button>
    </Card>
  )
}
