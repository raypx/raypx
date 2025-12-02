import type { AuthUser } from "@raypx/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import { Link } from "@tanstack/react-router";
import { HelpCircle, Laptop, LogOut, Moon, Settings, Sun, User } from "lucide-react";
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
  { value: "system", label: "System", icon: Laptop },
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
  const profilePath = "/dashboard/profile";
  const settingsPath = "/dashboard/settings";
  const avatarSize = avatar?.size ?? "size-8";
  const {
    hooks: { useSession },
  } = useAuth();
  const session = useSession();
  const { theme, setTheme } = useTheme();
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

  const hasMiddleSection = showThemeSwitcher || !!helpPath || showKeyboardShortcuts;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="My Account"
          className={`${avatarSize} rounded-full p-0 cursor-pointer ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
          size="icon"
          variant="ghost"
        >
          <Avatar className={avatarSize}>
            {userImage && <AvatarImage alt={userName} src={userImage} />}
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60 p-1" forceMount>
        {/* User Info Header */}
        <DropdownMenuItem asChild className="p-0 font-normal focus:bg-accent cursor-pointer">
          <Link className="flex items-center gap-3 px-3 py-2.5" to={profilePath}>
            <div className="flex flex-col space-y-0.5 overflow-hidden">
              <p className="text-sm font-medium leading-none truncate">{userName}</p>
              {userEmail && (
                <p className="text-xs text-muted-foreground truncate max-w-[180px]">{userEmail}</p>
              )}
            </div>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link className="flex items-center" to={profilePath}>
              <User className="mr-2 size-4 text-muted-foreground" />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link className="flex items-center" to={settingsPath}>
              <Settings className="mr-2 size-4 text-muted-foreground" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* Custom menu items */}
        {menuItems && (
          <>
            <DropdownMenuSeparator />
            {menuItems.map((item, index) => (
              <div key={index}>{item}</div>
            ))}
          </>
        )}

        {hasMiddleSection && <DropdownMenuSeparator />}

        {/* Theme Switcher */}
        {showThemeSwitcher && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <Sun className="mr-2 size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-muted-foreground" />
              <Moon className="absolute mr-2 size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-muted-foreground" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup onValueChange={setTheme} value={theme}>
                {themeConfig.map((t) => {
                  const Icon = t.icon;
                  return (
                    <DropdownMenuRadioItem className="cursor-pointer" key={t.value} value={t.value}>
                      <Icon className="mr-2 size-4 text-muted-foreground" />
                      {t.label}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Help/Documentation */}
        {helpPath && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link className="flex items-center" to={helpPath}>
              <HelpCircle className="mr-2 size-4 text-muted-foreground" />
              <span>Help & Support</span>
            </Link>
          </DropdownMenuItem>
        )}

        {/* Keyboard Shortcuts Hint */}
        {showKeyboardShortcuts && (
          <>
            {/* Separator only if other items above it in middle section didn't trigger one? 
                No, we used one separator for the whole block. 
                But if showThemeSwitcher is false AND helpPath is false, but shortcuts is true,
                we need a separator before shortcuts. hasMiddleSection handles this.
                
                However, if we have Theme AND Shortcuts, do we want a separator between them?
                Usually no, they are grouped. But shortcuts hint often has a separator before it if it's distinct.
                Let's keep it simple: grouped together.
            */}
            {!showThemeSwitcher &&
            !helpPath &&
            hasMiddleSection ? null : /* If theme/help exist, shortcuts is just at bottom of that group. */
            /* If ONLY shortcuts exist, hasMiddleSection adds the top separator. */
            /* Wait, originally shortcuts had its own separator. */
            /* Let's assume shortcuts is footer-like for the middle section. */
            showThemeSwitcher || helpPath ? (
              <DropdownMenuSeparator />
            ) : null}
            <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground">
              <span>Shortcuts</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </>
        )}

        <DropdownMenuSeparator />

        {/* Sign Out */}
        <DropdownMenuItem
          asChild
          className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <Link className="flex items-center" to={signOutPath ?? defaultAuthRoutes.signOut}>
            <LogOut className="mr-2 size-4" />
            <span>Sign Out</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
