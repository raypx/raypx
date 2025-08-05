"use client"

import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import { Separator } from "@raypx/ui/components/separator"
import {
  Clock,
  Loader2,
  MapPin,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react"
import { useState } from "react"

import type { UserSession } from "./types"

interface DevicesTabProps {
  devices: UserSession[]
  onRevokeSession: ({
    sessionId,
    token,
  }: {
    sessionId: string
    token: string
  }) => Promise<void>
  onRevokeAllOther: () => Promise<void>
  loading: boolean
}

export default function DevicesTab({
  devices,
  onRevokeSession,
  onRevokeAllOther,
  loading,
}: DevicesTabProps) {
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(
    null,
  )
  const [revokingAllOther, setRevokingAllOther] = useState(false)

  const handleRevokeSession = async ({
    sessionId,
    token,
  }: {
    sessionId: string
    token: string
  }) => {
    setRevokingSessionId(sessionId)
    try {
      await onRevokeSession({ sessionId, token })
    } catch (error) {
      console.error("Failed to revoke session:", error)
    } finally {
      setRevokingSessionId(null)
    }
  }

  const handleRevokeAllOther = async () => {
    setRevokingAllOther(true)
    try {
      await onRevokeAllOther()
    } catch (error) {
      console.error("Failed to revoke all other sessions:", error)
    } finally {
      setRevokingAllOther(false)
    }
  }

  const getDeviceIcon = (deviceType: "mobile" | "tablet" | "desktop") => {
    switch (deviceType) {
      case "mobile":
        return Smartphone
      case "tablet":
        return Tablet
      default:
        return Monitor
    }
  }

  const formatLastActive = (lastActive: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - lastActive.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays < 30) return `${diffDays} days ago`
    return lastActive.toLocaleDateString()
  }

  const otherDevices = devices.filter((device) => !device.isCurrent)

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-medium">Active Sessions</h4>
            <p className="text-sm text-muted-foreground">
              Manage your active sessions across all devices
            </p>
          </div>
          {otherDevices.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevokeAllOther}
              disabled={loading || revokingAllOther}
              className="text-red-600 hover:text-red-700"
            >
              {revokingAllOther ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : null}
              Revoke All Other Sessions
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {devices.map((device) => {
            const IconComponent = getDeviceIcon(device.deviceType)
            const isRevoking = revokingSessionId === device.id

            return (
              <div
                key={device.id}
                className={`p-4 border rounded-lg ${
                  device.isCurrent ? "bg-blue-50 border-blue-200" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center justify-center size-12 rounded-lg bg-muted">
                      <IconComponent className="size-6" />
                    </div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium">
                            {device.deviceName ||
                              `${device.browser} on ${device.os}`}
                          </p>
                          {device.isCurrent && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-blue-100 text-blue-700"
                            >
                              Current Device
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {device.browser && device.os && (
                            <div className="flex items-center space-x-1">
                              <Monitor className="size-3" />
                              <span>
                                {device.browser} • {device.os}
                              </span>
                            </div>
                          )}
                          {device.location && (
                            <div className="flex items-center space-x-1">
                              <MapPin className="size-3" />
                              <span>{device.location}</span>
                            </div>
                          )}
                          {device.ipAddress && (
                            <div className="flex items-center space-x-1">
                              <span>IP: {device.ipAddress}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1">
                            <Clock className="size-3" />
                            <span>
                              Last active: {formatLastActive(device.lastActive)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {!device.isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleRevokeSession({
                          sessionId: device.id,
                          token: device.token,
                        })
                      }
                      disabled={loading || isRevoking}
                      className="text-red-600 hover:text-red-700"
                    >
                      {isRevoking ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Revoke"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {devices.length === 0 && (
          <div className="flex items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">No active sessions found</p>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="text-base font-medium">Security Tips</h4>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            If you notice any unfamiliar devices, revoke them immediately and
            consider changing your password. Regularly reviewing your active
            sessions helps keep your account secure.
          </p>
        </div>
      </div>
    </div>
  )
}
