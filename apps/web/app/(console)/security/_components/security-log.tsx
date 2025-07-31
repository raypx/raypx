"use client"

import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/select"
import { toast } from "@raypx/ui/components/toast"
import { format } from "date-fns"
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  MapPin,
  RefreshCw,
  Shield,
} from "lucide-react"
import { useEffect, useState } from "react"

interface SecurityEvent {
  id: string
  type:
    | "login"
    | "logout"
    | "password_change"
    | "2fa_enable"
    | "2fa_disable"
    | "failed_login"
  description: string
  ipAddress: string
  location: string
  userAgent: string
  timestamp: string
  success: boolean
}

export function SecurityLog() {
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    fetchSecurityLog()
  }, [])

  const fetchSecurityLog = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/auth/security-log")
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load security log",
      )
    } finally {
      setLoading(false)
    }
  }

  const getEventIcon = (type: string, success: boolean) => {
    if (!success) {
      return <AlertTriangle className="h-4 w-4 text-destructive" />
    }

    switch (type) {
      case "login":
      case "logout":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "password_change":
      case "2fa_enable":
      case "2fa_disable":
        return <Shield className="h-4 w-4 text-blue-500" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getEventVariant = (type: string, success: boolean) => {
    if (!success) return "destructive"

    switch (type) {
      case "login":
      case "2fa_enable":
        return "default"
      case "logout":
      case "password_change":
        return "secondary"
      case "2fa_disable":
        return "outline"
      default:
        return "secondary"
    }
  }

  const filteredEvents = events.filter((event) => {
    if (filter === "all") return true
    if (filter === "failed") return !event.success
    return event.type === filter
  })

  if (loading) {
    return <div>Loading security log...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="login">Login Events</SelectItem>
                <SelectItem value="failed">Failed Attempts</SelectItem>
                <SelectItem value="password_change">
                  Password Changes
                </SelectItem>
                <SelectItem value="2fa_enable">2FA Enabled</SelectItem>
                <SelectItem value="2fa_disable">2FA Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary">{filteredEvents.length} events</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSecurityLog}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredEvents.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-shrink-0 mt-0.5">
              {getEventIcon(event.type, event.success)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant={getEventVariant(event.type, event.success)}
                  className="text-xs"
                >
                  {event.type.replace("_", " ").toUpperCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(
                    new Date(event.timestamp),
                    "MMM dd, yyyy 'at' HH:mm:ss",
                  )}
                </span>
              </div>
              <p className="text-sm font-medium mb-1">{event.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>{event.location}</span>
                </div>
                <span>IP: {event.ipAddress}</span>
              </div>
              {event.userAgent && (
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {event.userAgent}
                </div>
              )}
            </div>
          </div>
        ))}

        {filteredEvents.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {filter === "all"
              ? "No security events found"
              : `No ${filter} events found`}
          </div>
        )}
      </div>
    </div>
  )
}
