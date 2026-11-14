import { useTranslations } from "../i18n.js";
import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { CommandPalette, type CommandGroup } from "@raypx/blocks/command-palette";
import { SettingsIcon } from "@raypx/icons/settings";

type DesktopPage = "/agents" | "/pages" | "/account";

export function DesktopCommandMenu({
  open,
  onOpenChange,
  pages,
  onSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: readonly { to: DesktopPage; label: string; icon: ReactNode }[];
  onSettings: () => void;
}) {
  const router = useRouter();
  const c = useTranslations("common");
  const groups: CommandGroup[] = [
    {
      label: c("actions"),
      items: [
        { id: "settings", label: c("settings"), icon: <SettingsIcon />, onSelect: onSettings },
      ],
    },
    {
      label: c("pages"),
      items: pages.map((page) => ({
        id: `page:${page.to}`,
        label: page.label,
        icon: page.icon,
        onSelect: () => void router.navigate({ to: page.to }),
      })),
    },
  ];
  return <CommandPalette open={open} onOpenChange={onOpenChange} groups={groups} />;
}
