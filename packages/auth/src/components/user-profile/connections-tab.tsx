"use client"

import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import { Plus, Unlink } from "lucide-react"
import { ProvidersCard } from "../providers-card"
import type { ConnectedAccount } from "./types"

interface ConnectionsTabProps {
  accounts: ConnectedAccount[]
  onConnect: (provider: string) => Promise<void>
  onDisconnect: (accountId: string) => Promise<void>
  loading: boolean
}

export default function ConnectionsTab({
  accounts,
  onConnect,
  onDisconnect,
  loading,
}: ConnectionsTabProps) {
  const handleConnect = async (provider: string) => {
    try {
      await onConnect(provider)
    } catch (error) {
      console.error("Failed to connect account:", error)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    try {
      await onDisconnect(accountId)
    } catch (error) {
      console.error("Failed to disconnect account:", error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="text-base font-medium">Connected Accounts333</h4>
        <p className="text-sm text-muted-foreground">
          Connect third-party accounts for quick login and data synchronization
        </p>

        {/* Connected Accounts */}
        <ProvidersCard />
        {accounts.length > 0 && (
          <div className="space-y-3">
            <h5 className="text-sm font-medium text-muted-foreground">
              Connected
            </h5>
            {accounts.map((account) => {
              const IconComponent = account.icon
              return account.connected ? (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center size-10 rounded-full bg-muted">
                      <IconComponent className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium capitalize">
                        {account.provider}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {account.email || account.name || "Connected"}
                      </p>
                      {account.connectedAt && (
                        <p className="text-xs text-muted-foreground">
                          Connected {account.connectedAt.toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge
                      variant="secondary"
                      className="text-xs bg-green-100 text-green-700"
                    >
                      Connected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(account.id)}
                      disabled={loading}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Unlink className="size-4 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 border rounded-lg border-dashed"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center size-10 rounded-full bg-muted">
                      <IconComponent className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium capitalize">
                        {account.provider}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Not connected
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleConnect(account.provider)}
                    disabled={loading}
                  >
                    <Plus className="size-4 mr-1" />
                    Connect
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {accounts.length === 0 && (
          <div className="flex items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">
              No account providers available
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
