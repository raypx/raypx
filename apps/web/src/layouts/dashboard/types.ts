import type { ReactNode } from "react";

export interface User {
  name: string;
  email: string;
  avatar?: string | null;
}

export interface Team {
  name: string;
  logo: React.ElementType<{ className?: string }>;
  plan: string;
}

export interface BaseNavItem {
  title: string;
  badge?: string;
  icon?: React.ElementType<{ className?: string }>;
}

export type NavItem =
  | (BaseNavItem & {
      items: (BaseNavItem & { url: string; icon?: React.ElementType<{ className?: string }> })[];
      url?: never;
    })
  | (BaseNavItem & {
      url: string;
      items?: never;
    });

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface SidebarData {
  user: User;
  teams?: Team[];
  navGroups: NavGroup[];
}

