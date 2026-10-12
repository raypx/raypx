import { DotsThree, SignOut, Globe } from "@phosphor-icons/react";
import { LOCALE_OPTIONS } from "@voidmix/i18n";
import { Link } from "@tanstack/react-router";
import { useLocale, useSetLocale } from "../../i18n/client";
import { Suspense, useState } from "react";

import { IconButton } from "@voidmix/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@voidmix/ui/components/ui/dropdown-menu";
import { LazyThemeMenuItems, loadThemeMenuItems } from "../../components/theme-menu-lazy";
import { useTranslations } from "../../i18n/client";

export function AccountMenu({
  name,
  role,
  onSignOut,
}: {
  name: string;
  role: string | undefined;
  onSignOut: () => Promise<void>;
}) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [changing, setChanging] = useState(false);
  const [open, setOpen] = useState(false);
  const t = useTranslations("navigation");
  const prefetchThemeMenu = () => {
    void loadThemeMenuItems().catch(() => undefined);
  };

  return (
    <DropdownMenu
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          prefetchThemeMenu();
        }
      }}
      open={open}
    >
      <DropdownMenuTrigger
        render={
          <IconButton
            label={t("openAccountMenu")}
            onFocus={prefetchThemeMenu}
            onPointerDown={prefetchThemeMenu}
            size="icon-sm"
            variant="ghost"
          >
            <DotsThree aria-hidden="true" weight="bold" />
          </IconButton>
        }
      />
      <DropdownMenuContent align="end" className="min-w-44" side="top" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2">
            <span className="truncate text-foreground">{name}</span>
            <DropdownMenuShortcut>{role ?? t("user")}</DropdownMenuShortcut>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
          {open ? (
            <Suspense fallback={null}>
              <LazyThemeMenuItems />
            </Suspense>
          ) : null}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
          {LOCALE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              disabled={changing || locale === option.value}
              onClick={() => {
                setChanging(true);
                void setLocale(option.value)
                  .catch(() => undefined)
                  .finally(() => setChanging(false));
              }}
            >
              {option.nativeName}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/" />}>
          <Globe aria-hidden="true" />
          {t("website")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => void onSignOut()}>
          <SignOut aria-hidden="true" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
