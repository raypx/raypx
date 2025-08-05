export interface UserProfile {
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

export interface UserSession {
  id: string
  token: string
  deviceName?: string
  deviceType: "mobile" | "tablet" | "desktop"
  browser?: string
  os?: string
  location?: string
  ipAddress?: string
  isCurrent: boolean
  lastActive: Date
  createdAt: Date
}

export interface ConnectedAccount {
  id: string
  provider: string
  providerAccountId: string
  email?: string
  name?: string
  image?: string
  connected: boolean
  connectedAt?: Date
  icon: React.ComponentType<{ className?: string }>
}
