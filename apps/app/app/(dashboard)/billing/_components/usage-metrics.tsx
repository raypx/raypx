"use client"

import { Badge } from "@raypx/ui/components/badge"
import { Progress } from "@raypx/ui/components/progress"
import { toast } from "@raypx/ui/components/toast"
import { Activity, TrendingDown, TrendingUp } from "lucide-react"
import { useEffect, useState } from "react"

interface UsageData {
  current: {
    requests: number
    storage: number
    bandwidth: number
  }
  limits: {
    requests: number
    storage: number
    bandwidth: number
  }
  trend: {
    requests: number
    storage: number
    bandwidth: number
  }
}

export function UsageMetrics() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsageMetrics()
  }, [])

  const fetchUsageMetrics = async () => {
    try {
      const response = await fetch("/api/billing/usage")
      if (response.ok) {
        const data = await response.json()
        setUsage(data)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load usage metrics",
      )
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="h-3 w-3 text-green-500" />
    if (trend < 0) return <TrendingDown className="h-3 w-3 text-red-500" />
    return <Activity className="h-3 w-3 text-muted-foreground" />
  }

  const getTrendColor = (trend: number) => {
    if (trend > 0) return "text-green-600"
    if (trend < 0) return "text-red-600"
    return "text-muted-foreground"
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading usage...</div>
  }

  if (!usage) {
    return (
      <div className="text-sm text-muted-foreground">Failed to load usage</div>
    )
  }

  const getUsagePercentage = (current: number, limit: number) => {
    if (limit === -1) return 0 // unlimited
    return Math.min((current / limit) * 100, 100)
  }

  const getUsageStatus = (current: number, limit: number) => {
    if (limit === -1) return "default"
    const percentage = (current / limit) * 100
    if (percentage >= 90) return "destructive"
    if (percentage >= 75) return "secondary"
    return "default"
  }

  return (
    <div className="space-y-4">
      {/* API Requests */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">API Requests</span>
          <div className="flex items-center gap-1">
            {getTrendIcon(usage.trend.requests)}
            <span className={`text-xs ${getTrendColor(usage.trend.requests)}`}>
              {usage.trend.requests > 0 ? "+" : ""}
              {usage.trend.requests}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatNumber(usage.current.requests)} /{" "}
            {usage.limits.requests === -1
              ? "∞"
              : formatNumber(usage.limits.requests)}
          </span>
          <Badge
            variant={getUsageStatus(
              usage.current.requests,
              usage.limits.requests,
            )}
            className="text-xs"
          >
            {usage.limits.requests === -1
              ? "∞"
              : Math.round(
                  getUsagePercentage(
                    usage.current.requests,
                    usage.limits.requests,
                  ),
                )}
            %
          </Badge>
        </div>
        <Progress
          value={getUsagePercentage(
            usage.current.requests,
            usage.limits.requests,
          )}
          className="h-1.5"
        />
      </div>

      {/* Storage */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Storage</span>
          <div className="flex items-center gap-1">
            {getTrendIcon(usage.trend.storage)}
            <span className={`text-xs ${getTrendColor(usage.trend.storage)}`}>
              {usage.trend.storage > 0 ? "+" : ""}
              {usage.trend.storage}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatBytes(usage.current.storage)} /{" "}
            {formatBytes(usage.limits.storage)}
          </span>
          <Badge
            variant={getUsageStatus(
              usage.current.storage,
              usage.limits.storage,
            )}
            className="text-xs"
          >
            {Math.round(
              getUsagePercentage(usage.current.storage, usage.limits.storage),
            )}
            %
          </Badge>
        </div>
        <Progress
          value={getUsagePercentage(
            usage.current.storage,
            usage.limits.storage,
          )}
          className="h-1.5"
        />
      </div>

      {/* Bandwidth */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Bandwidth</span>
          <div className="flex items-center gap-1">
            {getTrendIcon(usage.trend.bandwidth)}
            <span className={`text-xs ${getTrendColor(usage.trend.bandwidth)}`}>
              {usage.trend.bandwidth > 0 ? "+" : ""}
              {usage.trend.bandwidth}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatBytes(usage.current.bandwidth)} /{" "}
            {usage.limits.bandwidth === -1
              ? "∞"
              : formatBytes(usage.limits.bandwidth)}
          </span>
          <Badge
            variant={getUsageStatus(
              usage.current.bandwidth,
              usage.limits.bandwidth,
            )}
            className="text-xs"
          >
            {usage.limits.bandwidth === -1
              ? "∞"
              : Math.round(
                  getUsagePercentage(
                    usage.current.bandwidth,
                    usage.limits.bandwidth,
                  ),
                )}
            %
          </Badge>
        </div>
        <Progress
          value={getUsagePercentage(
            usage.current.bandwidth,
            usage.limits.bandwidth,
          )}
          className="h-1.5"
        />
      </div>
    </div>
  )
}
