import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import { Link } from "@tanstack/react-router";
import { Check, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultAuthRoutes } from "../../config/routes";
import { useAuth } from "../hooks";

/**
 * Get user initials from name or email
 */
function getUserInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const names = name.trim().split(" ");
    if (names.length >= 2) {
      const firstInitial = names[0]?.[0];
      const lastInitial = names[names.length - 1]?.[0];
      if (firstInitial && lastInitial) {
        return `${firstInitial}${lastInitial}`.toUpperCase();
      }
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
}

/**
 * Theme configuration
 */
const themeConfig = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/**
 * UserButton component with dropdown menu
 *
 * Features:
 * - User avatar with fallback initials
 * - User info display (name, email)
 * - Settings option
 * - Theme switcher (light/dark)
 * - Sign out button
 */
export const UserButton = () => {
  const {
    hooks: { useSession },
  } = useAuth();
  const session = useSession();
  const { themeMode, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show skeleton during loading
  if (!mounted || session.isPending) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  // Don't render if no session
  if (!session.data?.user) {
    return null;
  }

  const user = session.data.user;
  const userName = user.name || user.email || "Profile";
  const userEmail = user.email || "";
  const userInitials = getUserInitials(user.name, user.email);
  const userImage = user.image;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="My Account"
          className="size-8 rounded-full p-0 cursor-pointer"
          size="icon"
          variant="ghost"
        >
          <Avatar className="size-8">
            {userImage && <AvatarImage alt={userName} src={userImage} />}
            <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* User Info Section */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userName}</p>
            {userEmail && <p className="text-muted-foreground text-xs leading-none">{userEmail}</p>}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Settings */}
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link className="flex items-center" to="/dashboard">
            <Settings className="mr-2 size-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>

        {/* Theme Switcher */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            {themeMode === "dark" ? (
              <Moon className="mr-2 size-4" />
            ) : (
              <Sun className="mr-2 size-4" />
            )}
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {themeConfig.map((theme) => {
              const Icon = theme.icon;
              const isActive = themeMode === theme.value;
              return (
                <DropdownMenuItem
                  className="cursor-pointer"
                  key={theme.value}
                  onClick={() => setTheme(theme.value)}
                >
                  <Icon className="mr-2 size-4" />
                  <span>{theme.label}</span>
                  {isActive && <Check className="ml-auto size-4" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {/* Sign Out */}
        <DropdownMenuItem asChild className="cursor-pointer" variant="destructive">
          <Link className="flex items-center" to={defaultAuthRoutes.signOut}>
            <LogOut className="mr-2 size-4" />
            <span>Sign Out</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
