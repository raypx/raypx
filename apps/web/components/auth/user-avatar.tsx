"use client"

import { signOut, useSession } from "@raypx/auth/client"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@raypx/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu"
import { LogOut, Moon, Palette, Sun, User } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"

const themes = [
  { name: "Light", value: "light", icon: Sun },
  { name: "Dark", value: "dark", icon: Moon },
  { name: "System", value: "system", icon: Palette },
]

export function UserAvatar() {
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()

  if (!session?.user) {
    return null
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const userInitials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : session.user.email?.[0]?.toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center space-x-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label={`User menu for ${session.user.name || session.user.email}`}
        >
          <Avatar className="size-8">
            <AvatarImage
              src={session.user.image || ""}
              alt={session.user.name || "User avatar"}
            />
            <AvatarFallback className="bg-blue-500 text-white text-sm">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{session.user.name}</p>
          <p className="text-xs text-muted-foreground">{session.user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <User className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {themes.map((item) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={item.value}
                    checked={theme === item.value}
                    onCheckedChange={() => setTheme(item.value)}
                  >
                    {item.name}
                  </DropdownMenuCheckboxItem>
                )
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleSignOut} variant="destructive">
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
