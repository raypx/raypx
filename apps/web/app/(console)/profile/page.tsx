"use client"

import { sendVerificationEmail, useSession } from "@raypx/auth/client"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@raypx/ui/components/avatar"
import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { format } from "date-fns"
import { Calendar, Mail, Shield, User } from "lucide-react"
import { AccountConnections } from "./_components/account-connections"
import { DeleteAccount } from "./_components/delete-account"

export default function ProfilePage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return null
  }

  const handleSendVerificationEmail = async () => {
    await sendVerificationEmail({
      email: session.user.email,
    })
  }

  const user = session.user
  const userInitials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user.email?.[0]?.toUpperCase() || "U"

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Profile</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* User Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Information
            </CardTitle>
            <CardDescription>Your personal account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarImage
                  src={user.image || ""}
                  alt={user.name || "User avatar"}
                />
                <AvatarFallback className="bg-blue-500 text-white text-lg">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">
                  {user.name || "No name provided"}
                </h3>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{user.email}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Account Details
            </CardTitle>
            <CardDescription>Account status and metadata</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">User ID:</span>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {user.id}
                </code>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Email Verified:</span>
                {user.emailVerified ? (
                  <Badge variant="default">Verified</Badge>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={handleSendVerificationEmail}
                  >
                    Unverified
                  </Button>
                )}
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Account Created:</span>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{format(user.createdAt, "MM/dd/yyyy")}</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Last Updated:</span>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{format(user.updatedAt, "MM/dd/yyyy")}</span>
                </div>
              </div>

              {user.role && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Role:</span>
                  <Badge variant="outline">{user.role}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <AccountConnections />
      <DeleteAccount />
    </div>
  )
}
