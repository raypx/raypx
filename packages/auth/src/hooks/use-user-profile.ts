"use client"

import { toast } from "@raypx/ui/components/toast"
import { useCallback, useEffect, useState } from "react"
import { updateUser, useSession } from "../client"

interface UserProfile {
  id: string
  name: string
  username?: string
  email: string
  emailVerified: boolean
  image?: string
  bio?: string
  role?: string
  createdAt: Date
  updatedAt: Date
}

interface UseUserProfileReturn {
  profile: UserProfile | null
  loading: boolean
  error: string | null
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>
  refreshProfile: () => Promise<void>
}

export function useUserProfile(): UseUserProfileReturn {
  const { data: session } = useSession()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 使用 better-auth 的 session 数据作为基础
      const userProfile: UserProfile = {
        id: session.user.id,
        name: session.user.name || "",
        username:
          session.user.username ||
          session.user.name?.toLowerCase().replace(/\s+/g, "") ||
          "",
        email: session.user.email,
        emailVerified: session.user.emailVerified || false,
        image: session.user.image || "",
        bio: "", // 可以从额外的 API 获取
        role: session.user.role || "user",
        createdAt: session.user.createdAt,
        updatedAt: session.user.updatedAt,
      }

      // 如果需要更多数据，可以调用额外的 API
      // const additionalData = await fetch('/api/v1/user/profile').then(res => res.json())
      // userProfile.bio = additionalData.bio

      setProfile(userProfile)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load profile"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [session?.user])

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!profile) return

      setLoading(true)
      setError(null)

      try {
        // 构建更新请求
        const updateData = {
          name: updates.name,
          image: updates.image,
          username: updates.username,
          // 其他可更新字段
        }

        // 调用更新 API（better-auth 可能有内置方法）
        const res = await updateUser(updateData)

        if (res.error) {
          throw new Error(res.error.message)
        }

        // 更新本地状态
        setProfile((prev) => (prev ? { ...prev, ...updates } : null))
        toast.success("Profile updated successfully")

        // 刷新 session 数据
        await refreshProfile()
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update profile"
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setLoading(false)
      }
    },
    [profile, refreshProfile],
  )

  useEffect(() => {
    refreshProfile()
  }, [refreshProfile])

  return {
    profile,
    loading,
    error,
    updateProfile,
    refreshProfile,
  }
}
