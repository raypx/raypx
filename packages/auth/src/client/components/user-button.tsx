"use client";

import { useLocale } from "@raypx/i18n/client";
import { getLocale, setLocale } from "@raypx/i18n/runtime";
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
import { Check, Languages, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
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
 * Language configuration
 */
const languageConfig = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
] as const;

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
 * - Language switcher (en/zh)
 * - Sign out button
 *
 * @example
 * ```tsx
 * <UserButton />
 * ```
 */
export const UserButton = () => {
  const { auth } = useAuth();
  const session = auth.useSession();
  const { t } = useLocale("userButton");
  const { themeMode, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<string>("en");

  useEffect(() => {
    setMounted(true);
    setCurrentLocale(getLocale());
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
  const userName = user.name || user.email || t("profile");
  const userEmail = user.email || "";
  const userInitials = getUserInitials(user.name, user.email);
  const userImage = user.image;

  const handleSignOut = async () => {
    await auth.signOut();
  };

  const handleLanguageChange = async (locale: string) => {
    await setLocale(locale as "en" | "zh");
    setCurrentLocale(locale);
    // Reload to apply new locale
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("myAccount")}
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
        <DropdownMenuItem className="cursor-pointer">
          <Settings className="mr-2 size-4" />
          <span>{t("settings")}</span>
        </DropdownMenuItem>

        {/* Theme Switcher */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            {themeMode === "dark" ? (
              <Moon className="mr-2 size-4" />
            ) : (
              <Sun className="mr-2 size-4" />
            )}
            <span>{t("theme")}</span>
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

        {/* Language Switcher */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <Languages className="mr-2 size-4" />
            <span>{t("language")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {languageConfig.map((lang) => {
              const isActive = currentLocale === lang.code;
              return (
                <DropdownMenuItem
                  className="cursor-pointer"
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                >
                  <span>{lang.label}</span>
                  {isActive && <Check className="ml-auto size-4" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Sign Out */}
        <DropdownMenuItem className="cursor-pointer" onClick={handleSignOut} variant="destructive">
          <LogOut className="mr-2 size-4" />
          <span>{t("signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
