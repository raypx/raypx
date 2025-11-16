import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Input } from "@raypx/ui/components/input";
import { Link } from "@tanstack/react-router";
import type { User as AuthUser } from "better-auth";
import { Bell, Search } from "lucide-react";
import { authRoutes } from "@/config/auth";

interface AppHeaderProps {
  user: AuthUser;
}

export function AppHeader({ user }: AppHeaderProps) {
  const userInitials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search..." type="search" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <Button size="icon" variant="ghost">
          <Bell className="h-5 w-5" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="relative h-10 w-10 rounded-full" variant="ghost">
              <Avatar>
                <AvatarImage alt={user?.name ?? ""} src={user?.image ?? undefined} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={authRoutes.signOut}>Sign out</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
