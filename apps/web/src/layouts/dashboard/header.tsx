import { type AuthUser, UserButton } from "@raypx/auth";
import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button } from "@raypx/ui/components/button";
import { DropdownMenuItem } from "@raypx/ui/components/dropdown-menu";
import { Input } from "@raypx/ui/components/input";
import { Separator } from "@raypx/ui/components/separator";
import { SidebarTrigger } from "@raypx/ui/components/sidebar";
import { Link } from "@tanstack/react-router";
import { Bell, Search, User } from "lucide-react";
import { authRoutes } from "~/config/auth";

interface HeaderProps {
  user: AuthUser;
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-background/80 backdrop-blur-md flex items-center justify-between px-4 gap-4 transition-all">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <SidebarTrigger className="-ml-1" />
        <Separator className="h-4 hidden md:block" orientation="vertical" />
        <div className="relative group max-w-md w-full hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          <Input
            className="pl-9 bg-muted/50 border-transparent focus:bg-background focus:border-primary/20 transition-all"
            placeholder="Search anything..."
            type="search"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Theme Toggle */}
        <ThemeSwitcher mode="light-dark" />

        {/* Notifications */}
        <Button className="relative" size="icon" variant="ghost">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
        </Button>

        <div className="h-6 w-px bg-border/50 mx-1 hidden md:block" />

        {/* User menu */}
        <UserButton
          avatar={{ size: "h-9 w-9" }}
          menuItems={[
            <DropdownMenuItem asChild key="profile">
              <Link className="flex items-center cursor-pointer" to="/dashboard/profile">
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
