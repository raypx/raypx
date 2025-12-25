import {
  IconBook,
  IconCreditCard,
  IconFolderCog,
  IconHome,
  IconKey,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

export type SidebarItem = {
  title: string;
  href: string;
  icon: typeof IconHome;
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
      {
        title: "Datasets",
        href: "/dashboard/datasets",
        icon: IconBook,
      },
    ],
  },
  account: {
    label: "Account",
    items: [
      {
        title: "Settings",
        href: "/dashboard/settings",
        icon: IconSettings,
      },
      {
        title: "API Keys",
        href: "/dashboard/api-keys",
        icon: IconKey,
      },
      {
        title: "Configs",
        href: "/dashboard/configs",
        icon: IconFolderCog,
      },
      {
        title: "Billing",
        href: "/dashboard/billing",
        icon: IconCreditCard,
      },
    ],
  },
  admin: {
    label: "Administration",
    role: ["admin", "superadmin"],
    items: [
      {
        title: "Users",
        href: "/dashboard/users",
        icon: IconUsers,
      },
    ],
  },
};
