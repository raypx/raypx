import { createFileRoute, Outlet } from "@tanstack/react-router";
import { desktopReturnTo } from "../../features/auth/return-to.js";
export const Route = createFileRoute("/(auth)")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === "string" ? { returnTo: desktopReturnTo(search.returnTo) } : {},
  component: Outlet,
});
