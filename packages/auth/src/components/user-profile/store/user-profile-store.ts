import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

export type MenuTab =
  | "profile"
  | "security"
  | "connections"
  | "devices"
  | "settings"

interface UserProfileState {
  // UI state
  activeTab: MenuTab
  isDialogOpen: boolean

  // Loading states
  isProfileLoading: boolean
  isConnectionsLoading: boolean
  isDevicesLoading: boolean

  // Error states
  profileError: string | null
  connectionsError: string | null
  devicesError: string | null

  // Actions
  setActiveTab: (tab: MenuTab) => void
  setDialogOpen: (open: boolean) => void
  setProfileLoading: (loading: boolean) => void
  setConnectionsLoading: (loading: boolean) => void
  setDevicesLoading: (loading: boolean) => void
  setProfileError: (error: string | null) => void
  setConnectionsError: (error: string | null) => void
  setDevicesError: (error: string | null) => void
  resetErrors: () => void
  resetState: () => void
}

const initialState = {
  activeTab: "profile" as MenuTab,
  isDialogOpen: false,
  isProfileLoading: false,
  isConnectionsLoading: false,
  isDevicesLoading: false,
  profileError: null,
  connectionsError: null,
  devicesError: null,
}

export const useUserProfileStore = create<UserProfileState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setActiveTab: (tab) => set({ activeTab: tab }),
    setDialogOpen: (open) => set({ isDialogOpen: open }),

    setProfileLoading: (loading) => set({ isProfileLoading: loading }),
    setConnectionsLoading: (loading) => set({ isConnectionsLoading: loading }),
    setDevicesLoading: (loading) => set({ isDevicesLoading: loading }),

    setProfileError: (error) => set({ profileError: error }),
    setConnectionsError: (error) => set({ connectionsError: error }),
    setDevicesError: (error) => set({ devicesError: error }),

    resetErrors: () =>
      set({
        profileError: null,
        connectionsError: null,
        devicesError: null,
      }),

    resetState: () => set(initialState),
  })),
)
