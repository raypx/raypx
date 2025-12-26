import type { AuthUser } from "@raypx/auth";
import { AppSidebar } from "./app-sidebar";
import { createSidebarData } from "./sidebar-data";

interface SidebarProps {
  user: AuthUser;
}

export function Sidebar({ user }: SidebarProps) {
  const sidebarData = createSidebarData({
    name: user.name || user.email || "User",
    email: user.email || "",
    avatar: user.image,
  });

  return (
    <AppSidebar
      sidebarData={sidebarData}
      className="border-r-0 bg-card/50 backdrop-blur-xl"
    />
  );
}
