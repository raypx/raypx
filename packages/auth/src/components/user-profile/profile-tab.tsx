"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@raypx/ui/components/avatar"
import { Button } from "@raypx/ui/components/button"
import { Input } from "@raypx/ui/components/input"
import { Label } from "@raypx/ui/components/label"
import { Textarea } from "@raypx/ui/components/textarea"
import { Camera } from "lucide-react"
import { useEffect, useState } from "react"

import type { UserProfile } from "./types"

interface ProfileTabProps {
  profile: UserProfile | null
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>
  loading: boolean
}

export default function ProfileTab({
  profile,
  onUpdateProfile,
  loading,
}: ProfileTabProps) {
  const [formData, setFormData] = useState({
    name: profile?.name || "",
    username: profile?.username || "",
    email: profile?.email || "",
    bio: profile?.bio || "",
    image: profile?.image || "",
  })

  // 同步 profile 变化到 formData
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || "",
        username: profile.username || "",
        email: profile.email || "",
        bio: profile.bio || "",
        image: profile.image || "",
      })
    }
  }, [profile])

  const handleSubmit = async () => {
    if (!profile) return

    const updates: Partial<UserProfile> = {}
    if (formData.name !== profile.name) updates.name = formData.name
    if (formData.username !== profile.username)
      updates.username = formData.username
    if (formData.bio !== profile.bio) updates.bio = formData.bio
    if (formData.image !== profile.image) updates.image = formData.image

    if (Object.keys(updates).length > 0) {
      await onUpdateProfile(updates)
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No profile data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Avatar className="size-20">
          <AvatarImage
            src={formData.image || "/placeholder.svg"}
            alt="Avatar"
          />
          <AvatarFallback className="text-lg">
            {formData.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <Button variant="outline" size="sm">
            <Camera className="size-4 mr-2" />
            Change Avatar
          </Button>
          <p className="text-sm text-muted-foreground">
            JPG, PNG formats supported. Recommended size 200x200
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Name
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            className="h-10"
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-medium">
            Username
          </Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, username: e.target.value }))
            }
            className="h-10"
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">
          Email Address
        </Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          disabled
          className="h-10 bg-muted"
        />
        <p className="text-xs text-muted-foreground">
          Email cannot be changed directly. Please contact support if needed.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio" className="text-sm font-medium">
          Bio
        </Label>
        <Textarea
          id="bio"
          placeholder="Tell us about yourself..."
          value={formData.bio}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, bio: e.target.value }))
          }
          className="min-h-[80px] resize-none"
          disabled={loading}
        />
      </div>

      <Button onClick={handleSubmit} className="w-full" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  )
}
