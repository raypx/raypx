"use client"

import { Button } from "@raypx/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/dialog"
import { Link, Monitor, Settings, Shield, User } from "lucide-react"
import { useEffect } from "react"
import { useConnectedAccounts } from "../../hooks/use-connected-accounts"
import { useUserProfile } from "../../hooks/use-user-profile"
import { useUserSessions } from "../../hooks/use-user-sessions"
import ConnectionsTab from "./connections-tab"
import DevicesTab from "./devices-tab"
import ProfileTab from "./profile-tab"
import SecurityTab from "./security-tab"
import SettingsTab from "./settings-tab"
import { ErrorState } from "./shared/error-state"
import {
  ConnectionsTabSkeleton,
  DevicesTabSkeleton,
  ProfileTabSkeleton,
} from "./shared/skeletons"
import { type MenuTab, useUserProfileStore } from "./store/user-profile-store"

interface UserProfileDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function UserProfileDialog({
  open,
  onOpenChange,
}: UserProfileDialogProps) {
  const {
    activeTab,
    setActiveTab,
    isProfileLoading,
    isConnectionsLoading,
    isDevicesLoading,
    profileError,
    connectionsError,
    devicesError,
    setProfileLoading,
    setConnectionsLoading,
    setDevicesLoading,
    setProfileError,
    setConnectionsError,
    setDevicesError,
  } = useUserProfileStore()

  // 使用自定义 hooks 获取数据
  const {
    profile,
    loading: profileLoading,
    error: profileErrorHook,
    updateProfile,
    refreshProfile,
  } = useUserProfile()

  const {
    sessions,
    loading: sessionsLoading,
    error: sessionsErrorHook,
    refreshSessions,
    revokeSessionById,
    revokeAllOtherSessions,
  } = useUserSessions()

  const {
    accounts,
    loading: accountsLoading,
    error: accountsErrorHook,
    refreshAccounts,
    connectAccount,
    disconnectAccount,
  } = useConnectedAccounts()

  // 同步 hook 状态到 store
  useEffect(() => {
    setProfileLoading(profileLoading)
    setProfileError(profileErrorHook)
  }, [profileLoading, profileErrorHook, setProfileLoading, setProfileError])

  useEffect(() => {
    setConnectionsLoading(accountsLoading)
    setConnectionsError(accountsErrorHook)
  }, [
    accountsLoading,
    accountsErrorHook,
    setConnectionsLoading,
    setConnectionsError,
  ])

  useEffect(() => {
    setDevicesLoading(sessionsLoading)
    setDevicesError(sessionsErrorHook)
  }, [sessionsLoading, sessionsErrorHook, setDevicesLoading, setDevicesError])

  const menuItems = [
    { id: "profile" as MenuTab, label: "Profile", icon: User },
    { id: "security" as MenuTab, label: "Security", icon: Shield },
    { id: "connections" as MenuTab, label: "Connections", icon: Link },
    { id: "devices" as MenuTab, label: "Devices", icon: Monitor },
    { id: "settings" as MenuTab, label: "Settings", icon: Settings },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        if (isProfileLoading) {
          return <ProfileTabSkeleton />
        }
        if (profileError) {
          return <ErrorState error={profileError} onRetry={refreshProfile} />
        }
        return (
          <ProfileTab
            profile={profile}
            onUpdateProfile={updateProfile}
            loading={isProfileLoading}
          />
        )

      case "security":
        return <SecurityTab />

      case "connections":
        if (isConnectionsLoading) {
          return <ConnectionsTabSkeleton />
        }
        if (connectionsError) {
          return (
            <ErrorState error={connectionsError} onRetry={refreshAccounts} />
          )
        }
        return (
          <ConnectionsTab
            accounts={accounts}
            onConnect={connectAccount}
            onDisconnect={disconnectAccount}
            loading={isConnectionsLoading}
          />
        )

      case "devices":
        if (isDevicesLoading) {
          return <DevicesTabSkeleton />
        }
        if (devicesError) {
          return <ErrorState error={devicesError} onRetry={refreshSessions} />
        }
        return (
          <DevicesTab
            devices={sessions}
            onRevokeSession={revokeSessionById}
            onRevokeAllOther={revokeAllOtherSessions}
            loading={isDevicesLoading}
          />
        )

      case "settings":
        return <SettingsTab />

      default:
        return (
          <ProfileTab
            profile={profile}
            onUpdateProfile={updateProfile}
            loading={isProfileLoading}
          />
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>User Settings</DialogTitle>
        </DialogHeader>

        <div className="flex h-[600px]">
          {/* 左侧菜单 */}
          <div className="w-56 border-r bg-muted/30">
            <nav className="p-4 space-y-2">
              {menuItems.map((item) => {
                const IconComponent = item.icon
                return (
                  <Button
                    key={item.id}
                    variant={activeTab === item.id ? "secondary" : "ghost"}
                    className="w-full justify-start h-9 text-xs font-medium"
                    onClick={() => setActiveTab(item.id)}
                  >
                    <IconComponent className="h-4 w-4 mr-3" />
                    {item.label}
                  </Button>
                )
              })}
            </nav>
          </div>

          {/* 右侧内容 */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-2xl">{renderContent()}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
