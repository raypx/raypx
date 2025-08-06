"use client"

import { toast } from "@raypx/ui/components/toast"
import { useCallback, useEffect, useState } from "react"
import { UAParser } from "ua-parser-js"
import { listSessions, revokeSession, useSession } from "../client"
import type { UserSession } from "../components/user-profile/types"

interface UseUserSessionsReturn {
  sessions: UserSession[]
  loading: boolean
  error: string | null
  refreshSessions: () => Promise<void>
  revokeSessionById: ({
    sessionId,
    token,
  }: {
    sessionId: string
    token: string
  }) => Promise<void>
  revokeAllOtherSessions: () => Promise<void>
}

export function useUserSessions(): UseUserSessionsReturn {
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: session } = useSession()

  const refreshSessions = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // 使用 better-auth 的 listSessions
      const { data } = await listSessions()

      // 转换数据格式
      const formattedSessions: UserSession[] = (data || []).map((item: any) => {
        const ua = new UAParser(item.userAgent || "")
        return {
          id: item.id,
          deviceName: `${ua.getBrowser().name} on ${ua.getOS().name}`,
          deviceType: detectDeviceType(item.userAgent || ""),
          browser: ua.getBrowser().name,
          os: ua.getOS().name,
          token: item.token,
          location: item.location,
          ipAddress: item.ipAddress,
          isCurrent: session?.session?.id === item?.id,
          lastActive: new Date(item.updatedAt),
          createdAt: new Date(item.createdAt),
        }
      })

      setSessions(formattedSessions)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load sessions"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  const revokeSessionById = useCallback(
    async ({ sessionId, token }: { sessionId: string; token: string }) => {
      try {
        await revokeSession({ token })

        // 从本地状态中移除
        setSessions((prev) => prev.filter((item) => item.id !== sessionId))
        toast.success("Session revoked successfully")
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to revoke session"
        toast.error(errorMessage)
      }
    },
    [],
  )

  const revokeAllOtherSessions = useCallback(async () => {
    try {
      // 获取除当前会话外的所有会话
      const otherSessions = sessions.filter((session) => !session.isCurrent)

      // 批量撤销
      await Promise.all(
        otherSessions.map((item) => revokeSession({ token: item.token || "" })),
      )

      // 更新本地状态
      setSessions((prev) => prev.filter((item) => item.isCurrent))
      toast.success(`Revoked ${otherSessions.length} sessions`)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to revoke sessions"
      toast.error(errorMessage)
    }
  }, [sessions])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  return {
    sessions,
    loading,
    error,
    refreshSessions,
    revokeSessionById,
    revokeAllOtherSessions,
  }
}

function detectDeviceType(userAgent: string): "mobile" | "tablet" | "desktop" {
  const ua = userAgent.toLowerCase()

  if (/tablet|ipad/.test(ua)) {
    return "tablet"
  }

  if (/mobile|android|iphone/.test(ua)) {
    return "mobile"
  }

  return "desktop"
}
