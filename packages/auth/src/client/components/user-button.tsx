import type { AuthUser } from "@raypx/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import { Link } from "@tanstack/react-router";
import { Check, HelpCircle, LogOut, Moon, Settings, Sun, User } from "lucide-react";
import type { ReactNode } from "react";
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

export interface UserButtonProps {
  /** User object (uses useAuth if not provided) */
  user?: AuthUser | null;
  /** Show theme switcher */
  showThemeSwitcher?: boolean;
  /** Custom menu items */
  menuItems?: ReactNode[];
  /** Sign out path */
  signOutPath?: string;
  /** Avatar configuration */
  avatar?: {
    /** Avatar size class */
    size?: string;
  };
  /** Help link */
  helpPath?: string;
  /** Show keyboard shortcuts hint */
  showKeyboardShortcuts?: boolean;
}

/**
 * UserButton component with dropdown menu
 *
 * Features:
 * - User avatar with fallback initials
 * - User info display (name, email)
 * - Customizable menu items
 * - Optional theme switcher (light/dark)
 * - Sign out button
 */
export const UserButton = ({
  user: userProp,
  showThemeSwitcher = true,
  menuItems,
  signOutPath,
  avatar = { size: "size-8" },
  helpPath,
  showKeyboardShortcuts = false,
}: UserButtonProps = {}) => {
  // Paths are hardcoded. Can be configured via auth config in the future if needed.
  const profilePath = "/dashboard/profile";
  const settingsPath = "/dashboard/settings";
  const avatarSize = avatar?.size ?? "size-8";
  const {
    hooks: { useSession },
  } = useAuth();
  const session = useSession();
  const { themeMode, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use provided user or get from session
  const user = userProp ?? session.data?.user;

  // Show skeleton during loading (only if using session)
  if (!userProp && (!mounted || session.isPending)) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  // Don't render if no user
  if (!user) {
    return null;
  }

  const userName = user.name || user.email || "Profile";
  const userEmail = user.email || "";
  const userInitials = getUserInitials(user.name, user.email);
  const userImage = user.image;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="My Account"
          className={`${avatarSize} rounded-full p-0 cursor-pointer`}
          size="icon"
          variant="ghost"
        >
          <Avatar className={avatarSize}>
            {userImage && <AvatarImage alt={userName} src={userImage} />}
            <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* User Info Section - Clickable to profile */}
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link className="flex flex-col space-y-1 p-2" to={profilePath}>
            <p className="text-sm font-medium leading-none">{userName}</p>
            {userEmail && (
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs leading-none">{userEmail}</p>
                <User className="size-3 text-muted-foreground" />
              </div>
            )}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Custom menu items */}
        {menuItems?.map((item, index) => (
          <div key={index}>{item}</div>
        ))}

        {/* Settings */}
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link className="flex items-center" to={settingsPath}>
            <Settings className="mr-2 size-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>

        {/* Theme Switcher */}
        {showThemeSwitcher && (
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
        )}

        {/* Help/Documentation */}
        {helpPath && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link className="flex items-center" to={helpPath}>
              <HelpCircle className="mr-2 size-4" />
              <span>Help & Support</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Keyboard Shortcuts Hint */}
        {showKeyboardShortcuts && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">?</kbd> for shortcuts
            </div>
          </>
        )}

        <DropdownMenuSeparator />

        {/* Sign Out */}
        <DropdownMenuItem asChild className="cursor-pointer" variant="destructive">
          <Link className="flex items-center" to={signOutPath ?? defaultAuthRoutes.signOut}>
            <LogOut className="mr-2 size-4" />
            <span>Sign Out</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
