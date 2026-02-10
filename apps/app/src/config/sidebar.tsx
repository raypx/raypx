import type { TablerIcon } from "@raypx/ui/components/icon";
import { IconHome } from "@tabler/icons-react";

export type SidebarItem = {
  title: string;
  href: string;
  icon: TablerIcon;
};

export type SidebarGroup = {
  label: string;
  items: SidebarItem[];
  /** Optional: restrict access to specific roles. If not provided, all users can see it. */
  role?: string[];
};

export const sidebarGroups: Record<string, SidebarGroup> = {
  main: {
    label: "Platform",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: IconHome,
      },
    ],
  },
};
