import { BookOpen, CreditCard, FileText, Home, Key, Settings, Users } from "lucide-react";

export type SidebarItem = {
  title: string;
  href: string;
  icon: typeof Home;
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
        icon: Home,
      },
      {
        title: "Knowledge",
        href: "/dashboard/knowledges",
        icon: BookOpen,
      },
      {
        title: "Documents",
        href: "/dashboard/documents",
        icon: FileText,
      },
    ],
  },
  account: {
    label: "Account",
    items: [
      {
        title: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
      },
      {
        title: "API Keys",
        href: "/dashboard/api-keys",
        icon: Key,
      },
      {
        title: "Billing",
        href: "/dashboard/billing",
        icon: CreditCard,
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
        icon: Users,
      },
    ],
  },
};
