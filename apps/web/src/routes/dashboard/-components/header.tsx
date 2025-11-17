import { type AuthUser, UserButton } from "@raypx/auth";
import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button } from "@raypx/ui/components/button";
import { DropdownMenuItem } from "@raypx/ui/components/dropdown-menu";
import { Input } from "@raypx/ui/components/input";
import { Link } from "@tanstack/react-router";
import { Bell, Search, User } from "lucide-react";
import { authRoutes } from "@/config/auth";

interface AppHeaderProps {
  user: AuthUser;
}

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search..." type="search" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <ThemeSwitcher mode="light-dark" />

        {/* Notifications */}
        <Button size="icon" variant="ghost">
          <Bell className="h-5 w-5" />
        </Button>

        {/* User menu */}
        <UserButton
          avatar={{ size: "h-10 w-10" }}
          menuItems={[
            <DropdownMenuItem asChild key="profile">
              <Link className="flex items-center" to="/dashboard/profile">
                <User className="mr-2 size-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>,
          ]}
          showThemeSwitcher={false}
          signOutPath={authRoutes.signOut}
          user={user}
        />
      </div>
    </header>
  );
}
