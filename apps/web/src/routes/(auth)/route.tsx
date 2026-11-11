import { authPageGuard } from "../../features/auth/auth-guard.js";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { safeReturnTo } from "../../features/auth/return-to.js";
import { useQuery } from "@tanstack/react-query";
import { publicConfigurationQuery } from "../../features/configuration/client.js";
import { AuthFormSection } from "../../features/auth/components/auth-form-section.js";

export const Route = createFileRoute("/(auth)")({
  beforeLoad: authPageGuard,
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === "string" ? { returnTo: safeReturnTo(search.returnTo) } : {},
  component: AuthLayout,
});

function AuthLayout() {
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";

  return (
    <AuthFormSection siteName={siteName}>
      <Outlet />
    </AuthFormSection>
  );
}
