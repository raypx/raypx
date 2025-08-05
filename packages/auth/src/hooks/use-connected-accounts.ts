"use client"

import { toast } from "@raypx/ui/components/toast"
import { Chrome, Github, Twitter } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { linkSocial, unlinkAccount } from "../client"

interface ConnectedAccount {
  id: string
  provider: string
  providerAccountId: string
  email?: string
  name?: string
  image?: string
  connected: boolean
  connectedAt?: Date
  icon: React.ComponentType<{ className?: string }>
}

interface UseConnectedAccountsReturn {
  accounts: ConnectedAccount[]
  loading: boolean
  error: string | null
  refreshAccounts: () => Promise<void>
  connectAccount: (provider: string) => Promise<void>
  disconnectAccount: (accountId: string) => Promise<void>
}

const PROVIDER_CONFIGS = {
  github: {
    name: "GitHub",
    icon: Github,
  },
  google: {
    name: "Google",
    icon: Chrome,
  },
  twitter: {
    name: "Twitter",
    icon: Twitter,
  },
  facebook: {
    name: "Facebook",
    icon: Chrome, // 使用 Chrome 作为占位符
  },
  linkedin: {
    name: "LinkedIn",
    icon: Chrome, // 使用 Chrome 作为占位符
  },
}

export function useConnectedAccounts(): UseConnectedAccountsReturn {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // 使用 better-auth 的 listAccounts
      const { data } = await fetch("/api/v1/auth/socials").then((res) =>
        res.json(),
      )
      console.log(data)

      // 处理接口返回的账户数据，根据是否有id判断连接状态
      const accounts: ConnectedAccount[] = (data || []).map((account: any) => ({
        id: account.id || `available-${account.provider}`,
        provider: account.provider,
        providerAccountId: account.providerAccountId || "",
        email: account.email,
        name: account.name,
        image: account.image,
        connected: !!account.id, // 有id表示已连接，没有id表示未连接
        connectedAt: account.createdAt
          ? new Date(account.createdAt)
          : undefined,
        icon:
          PROVIDER_CONFIGS[account.provider as keyof typeof PROVIDER_CONFIGS]
            ?.icon || Chrome,
      }))

      setAccounts(accounts)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load connected accounts"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  const connectAccount = useCallback(
    async (provider: string) => {
      try {
        setLoading(true)

        // 使用 better-auth 的 linkSocial
        await linkSocial({
          provider: provider as any,
          // 可能需要提供回调 URL
          callbackURL: `${window.location.origin}/auth/callback`,
        })

        // 刷新账户列表
        await refreshAccounts()
        toast.success(
          `${PROVIDER_CONFIGS[provider as keyof typeof PROVIDER_CONFIGS]?.name || provider} connected successfully`,
        )
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : `Failed to connect ${provider}`
        toast.error(errorMessage)
      } finally {
        setLoading(false)
      }
    },
    [refreshAccounts],
  )

  const disconnectAccount = useCallback(async (accountId: string) => {
    try {
      setLoading(true)

      // 使用 better-auth 的 unlinkAccount
      await unlinkAccount({
        providerId: accountId,
      })

      // 从本地状态中移除
      setAccounts((prev) => prev.filter((account) => account.id !== accountId))
      toast.success("Account disconnected successfully")
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to disconnect account"
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAccounts()
  }, [refreshAccounts])

  return {
    accounts,
    loading,
    error,
    refreshAccounts,
    connectAccount,
    disconnectAccount,
  }
}
