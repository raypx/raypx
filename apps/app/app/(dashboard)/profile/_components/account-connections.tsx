"use client"

import {
  linkSocial,
  listAccounts,
  unlinkAccount,
  useSession,
} from "@raypx/auth/client"
import { Button } from "@raypx/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { Github, Google } from "@raypx/ui/components/icons"
import { toast } from "@raypx/ui/components/toast"
import { Link, Unlink } from "lucide-react"
import { useEffect, useState } from "react"

type Provider = "github" | "google"

export function AccountConnections() {
  const { data: session } = useSession()
  const [isLoading, setIsLoading] = useState<{ [key in Provider]?: boolean }>(
    {},
  )
  const [connectedAccounts, setConnectedAccounts] = useState<{
    [key in Provider]?: boolean
  }>({
    github: false,
    google: false,
  })
  const [isLoadingConnections, setIsLoadingConnections] = useState(true)

  const fetchConnections = async () => {
    if (!session?.user) return

    try {
      const accountsResponse = await listAccounts()

      if (accountsResponse.data) {
        const accounts = accountsResponse.data
        const connections = {
          github: accounts.some((account) => account.provider === "github"),
          google: accounts.some((account) => account.provider === "google"),
        }
        setConnectedAccounts(connections)
      }
    } catch (error) {
      console.error("Failed to fetch account connections:", error)
    } finally {
      setIsLoadingConnections(false)
    }
  }

  useEffect(() => {
    fetchConnections()
  }, [session])

  if (!session?.user) {
    return null
  }

  const providerConfig = {
    github: {
      name: "GitHub",
      icon: <Github className="h-4 w-4" />,
      description: "Connect your GitHub account for seamless integration",
    },
    google: {
      name: "Google",
      icon: <Google className="h-4 w-4" />,
      description: "Connect your Google account for easy sign-in",
    },
  }

  const handleConnect = async (provider: Provider) => {
    try {
      setIsLoading({ ...isLoading, [provider]: true })

      const res = await linkSocial({
        provider,
        callbackURL: window.location.href,
      })

      if (res.error) {
        toast.error(
          `Failed to connect ${providerConfig[provider].name}: ${res.error.message}`,
        )
      } else if (res.data?.url) {
        window.location.href = res.data.url
      } else {
        toast.success(`Successfully connected ${providerConfig[provider].name}`)
        await fetchConnections()
      }
    } catch (error: any) {
      toast.error(
        `Failed to connect ${providerConfig[provider].name}: ${error.message}`,
      )
    } finally {
      setIsLoading({ ...isLoading, [provider]: false })
    }
  }

  const handleDisconnect = async (provider: Provider) => {
    try {
      setIsLoading({ ...isLoading, [provider]: true })

      const accountsResponse = await listAccounts()
      if (accountsResponse.data) {
        const accountToUnlink = accountsResponse.data.find(
          (account) => account.provider === provider,
        )

        if (accountToUnlink) {
          const res = await unlinkAccount({
            providerId: accountToUnlink.provider,
          })

          if (res.error) {
            toast.error(
              `Failed to disconnect ${providerConfig[provider].name}: ${res.error.message}`,
            )
          } else {
            toast.success(
              `Successfully disconnected ${providerConfig[provider].name}`,
            )
            await fetchConnections()
          }
        }
      }
    } catch (error: any) {
      toast.error(
        `Failed to disconnect ${providerConfig[provider].name}: ${error.message}`,
      )
    } finally {
      setIsLoading({ ...isLoading, [provider]: false })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          Connected Accounts
        </CardTitle>
        <CardDescription>
          Manage your connected social accounts for easy sign-in
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingConnections ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
          </div>
        ) : (
          Object.entries(providerConfig).map(([provider, config]) => {
            const isConnected = connectedAccounts[provider as Provider]
            const loading = isLoading[provider as Provider]

            return (
              <div
                key={provider}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {config.icon}
                  <div>
                    <h4 className="font-medium">{config.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {config.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <span className="text-sm text-green-600 font-medium">
                        Connected
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(provider as Provider)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Unlink className="h-3 w-3 mr-1" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnect(provider as Provider)}
                      disabled={loading}
                    >
                      <Link className="h-3 w-3 mr-1" />
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
