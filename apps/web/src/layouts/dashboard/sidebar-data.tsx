import { IconHome } from "@tabler/icons-react";
import type { SidebarData } from "./types";
import { sidebarGroups } from "~/config/sidebar";

/**
 * Convert sidebarGroups to SidebarData format
 */
export function createSidebarData(user: {
  name: string;
  email: string;
  avatar?: string | null;
}): SidebarData {
  return {
    user: {
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
    navGroups: Object.values(sidebarGroups).map((group) => ({
      title: group.label,
      items: group.items.map((item) => ({
        title: item.title,
        url: item.href,
        icon: item.icon,
      })),
    })),
  };
}

