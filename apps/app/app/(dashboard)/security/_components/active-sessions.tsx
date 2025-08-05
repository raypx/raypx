"use client"

import {
  listSessions,
  revokeSession,
  signOut,
  useSession,
} from "@raypx/auth/client"
import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import { toast } from "@raypx/ui/components/toast"
import { format } from "date-fns"
import { Clock, Loader2, Monitor, Smartphone, Tablet } from "lucide-react"
import { useEffect, useState } from "react"
import { UAParser } from "ua-parser-js"

export function ActiveSessions() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { data: session } = useSession()
  const [isTerminating, setIsTerminating] = useState<string | null>(null)

  useEffect(() => {
    fetchActiveSessions()
  }, [])

  const fetchActiveSessions = async () => {
    try {
      const { data, error } = await listSessions()
      if (error) {
        toast.error(error.message)
      } else {
        const list = (data || []).map((session) => {
          const ua = UAParser(session.userAgent || "")
          return {
            ...session,
            deviceType: ua.device.type || "desktop",
            deviceName: `${ua.os.name || ""} ${ua.browser.name || ""}`,
          }
        })
        setSessions(list)
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load active sessions",
      )
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeSession = async (item: any) => {
    setIsTerminating(item.id)
    try {
      const res = await revokeSession({
        token: item.id,
      })

      if (res.error) {
        toast.error(res.error.message)
      } else {
        toast.success("Session terminated successfully")
      }
      if (item.id === session?.session?.id) {
        signOut()
      }
      setIsTerminating(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to terminate session",
      )
    } finally {
      setIsTerminating(null)
    }
  }

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />
      case "tablet":
        return <Tablet className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  if (loading) {
    return <div>Loading active sessions...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Active Sessions:</span>
          <Badge variant="secondary">{sessions.length}</Badge>
        </div>
      </div>

      <div className="space-y-3">
        {sessions.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-4 border rounded-lg ${
              item.id === session?.session?.id
                ? "bg-muted/50 border-primary"
                : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {getDeviceIcon(item.deviceType)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{item.deviceName}</p>
                  {item.id === session?.session?.id && (
                    <Badge variant="default" className="text-xs">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>
                      Last active:{" "}
                      {format(
                        new Date(item.updatedAt),
                        "MMM dd, yyyy 'at' HH:mm",
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRevokeSession(item)}
              disabled={isTerminating === item.id}
            >
              {isTerminating === item.id ? (
                <Loader2 size={15} className="animate-spin" />
              ) : item.id === session?.session?.id ? (
                "Sign Out"
              ) : (
                "Terminate"
              )}
            </Button>
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No active sessions found
          </div>
        )}
      </div>
    </div>
  )
}
