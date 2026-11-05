import { authPageGuard } from "../../features/auth/auth-guard.ts";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { safeReturnTo } from "../../features/auth/return-to.ts";
import { useQuery } from "@tanstack/react-query";
import { publicConfigurationQuery } from "../../features/configuration/client.ts";
import { AuthBrandSection } from "../../features/auth/components/auth-brand-section.tsx";
import { AuthFormSection } from "../../features/auth/components/auth-form-section.tsx";

export const Route = createFileRoute("/(auth)")({
  beforeLoad: authPageGuard,
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === "string" ? { returnTo: safeReturnTo(search.returnTo) } : {},
  component: AuthLayout,
});

function AuthLayout() {
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_7fr]">
      <AuthBrandSection siteName={siteName} />
      <AuthFormSection siteName={siteName}>
        <Outlet />
      </AuthFormSection>
    </div>
  );
}
