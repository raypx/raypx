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
import { Icon } from "@raypx/ui/components/icon";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import { themeConfig, themeIcons } from "@raypx/ui/lib/theme-config";
import {
  IconHelpCircle,
  IconHome,
  IconLogout,
  IconMoon,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { defaultAuthRoutes } from "../../config/routes";
import { useAuth } from "../hooks";
import type { Session } from "../utils/router";

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

export interface UserButtonProps {
  /** User object (highest priority, uses session or useAuth if not provided) */
  user?: AuthUser | null;
  /** Session object from server-side loader (uses useAuth if not provided) */
  session?: Session | null;
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

export const UserButton = ({
  showThemeSwitcher = true,
  menuItems,
  signOutPath,
  avatar = { size: "size-8" },
  helpPath,
  showKeyboardShortcuts = false,
}: UserButtonProps = {}) => {
  const dashboardPath = "/dashboard";
  const settingsPath = "/dashboard/settings";
  const avatarSize = avatar?.size ?? "size-8";
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session, isPending } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading skeleton only if we're using the hook and it's pending
  if (!mounted || isPending) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  if (!session?.user) {
    return null;
  }

  const userName = session.user.name || session.user.email || "Profile";
  const userEmail = session.user.email || "";
  const userInitials = getUserInitials(session.user.name, session.user.email);
  const userImage = session.user.image;

  const hasMiddleSection = showThemeSwitcher || !!helpPath || showKeyboardShortcuts;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="My Account"
            className={`${avatarSize} cursor-pointer rounded-full p-0 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
            size="icon"
            variant="ghost"
          >
            <Avatar className={avatarSize}>
              {userImage && <AvatarImage alt={userName} src={userImage} />}
              <AvatarFallback className="bg-primary/10 font-medium text-primary text-xs">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </Button>
        }
      />

      <DropdownMenuContent align="end" className="w-60 p-1">
        <DropdownMenuItem
          className="cursor-pointer p-0 font-normal focus:bg-accent"
          render={
            <Link className="flex items-center gap-3 px-3 py-2.5" to={settingsPath}>
              <div className="flex flex-col space-y-0.5 overflow-hidden">
                <p className="truncate font-medium text-sm leading-none">{userName}</p>
                {userEmail && (
                  <p className="max-w-[180px] truncate text-muted-foreground text-xs">
                    {userEmail}
                  </p>
                )}
              </div>
            </Link>
          }
        />

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer"
            render={
              <Link className="flex items-center" to={dashboardPath}>
                <IconHome className="mr-2 size-4 text-muted-foreground" />
                <span>Dashboard</span>
              </Link>
            }
          />
          <DropdownMenuItem
            className="cursor-pointer"
            render={
              <Link className="flex items-center" to={settingsPath}>
                <IconSettings className="mr-2 size-4 text-muted-foreground" />
                <span>Settings</span>
              </Link>
            }
          />
        </DropdownMenuGroup>

        {menuItems && (
          <>
            <DropdownMenuSeparator />
            {menuItems.map((item, index) => (
              <div key={index}>{item}</div>
            ))}
          </>
        )}

        {hasMiddleSection && <DropdownMenuSeparator />}

        {showThemeSwitcher && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              {(() => {
                const Sun = themeIcons.light;
                const Moon = themeIcons.dark;
                return (
                  <>
                    <IconSun className="mr-2 size-4 rotate-0 scale-100 text-muted-foreground transition-all dark:-rotate-90 dark:scale-0" />
                    <IconMoon className="absolute mr-2 size-4 rotate-90 scale-0 text-muted-foreground transition-all dark:rotate-0 dark:scale-100" />
                  </>
                );
              })()}
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup onValueChange={setTheme} value={theme}>
                {themeConfig.map((config) => {
                  return (
                    <DropdownMenuRadioItem
                      className="cursor-pointer"
                      key={config.value}
                      value={config.value}
                    >
                      <Icon className="mr-2 size-4 text-muted-foreground" icon={config.icon} />
                      {config.label}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {helpPath && (
          <DropdownMenuItem
            className="cursor-pointer"
            render={
              <Link className="flex items-center" to={helpPath}>
                <IconHelpCircle className="mr-2 size-4 text-muted-foreground" />
                <span>Help & Support</span>
              </Link>
            }
          />
        )}
        {showKeyboardShortcuts && (
          <>
            {showThemeSwitcher || helpPath ? <DropdownMenuSeparator /> : null}
            <div className="flex items-center justify-between px-2 py-1.5 text-muted-foreground text-xs">
              <span>Shortcuts</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
          render={
            <Link className="flex items-center" to={signOutPath ?? defaultAuthRoutes.signOut}>
              <IconLogout className="mr-2 size-4" />
              <span>Sign Out</span>
            </Link>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
