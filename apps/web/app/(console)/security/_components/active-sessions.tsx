"use client"

import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import { toast } from "@raypx/ui/components/toast"
import { format } from "date-fns"
import {
  AlertTriangle,
  Clock,
  MapPin,
  Monitor,
  Smartphone,
  Tablet,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

interface Session {
  id: string
  deviceType: "desktop" | "mobile" | "tablet"
  browser: string
  os: string
  location: string
  ipAddress: string
  lastActive: string
  isCurrent: boolean
  createdAt: string
}

export function ActiveSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [terminatingIds, setTerminatingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchActiveSessions()
  }, [])

  const fetchActiveSessions = async () => {
    try {
      const response = await fetch("/api/auth/sessions")
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions || [])
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

  const terminateSession = async (sessionId: string) => {
    setTerminatingIds((prev) => new Set(prev).add(sessionId))

    try {
      const response = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setSessions((prev) =>
          prev.filter((session) => session.id !== sessionId),
        )
        toast.success("Session terminated successfully")
      } else {
        toast.error("Failed to terminate session")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setTerminatingIds((prev) => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    }
  }

  const terminateAllOtherSessions = async () => {
    try {
      const response = await fetch("/api/auth/sessions/terminate-others", {
        method: "POST",
      })

      if (response.ok) {
        setSessions((prev) => prev.filter((session) => session.isCurrent))
        toast.success("All other sessions terminated successfully")
      } else {
        toast.error("Failed to terminate sessions")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
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
        {sessions.filter((s) => !s.isCurrent).length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={terminateAllOtherSessions}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Terminate All Others
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`flex items-center justify-between p-4 border rounded-lg ${
              session.isCurrent ? "bg-muted/50 border-primary" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {getDeviceIcon(session.deviceType)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {session.browser} on {session.os}
                  </p>
                  {session.isCurrent && (
                    <Badge variant="default" className="text-xs">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{session.location}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>
                      Last active:{" "}
                      {format(
                        new Date(session.lastActive),
                        "MMM dd, yyyy 'at' HH:mm",
                      )}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  IP: {session.ipAddress}
                </div>
              </div>
            </div>
            {!session.isCurrent && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => terminateSession(session.id)}
                disabled={terminatingIds.has(session.id)}
              >
                {terminatingIds.has(session.id) ? (
                  "Terminating..."
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            )}
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
