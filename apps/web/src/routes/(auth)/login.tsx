import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../features/auth/auth-form";
import { validateAuthSearch } from "../../features/auth/route-search";
import { localizedRouteHead } from "../../i18n/route-meta";

export const Route = createFileRoute("/(auth)/login")({
  validateSearch: validateAuthSearch,
  component: LoginRoute,
  head: ({ matches }) => localizedRouteHead(matches, "loginTitle", "loginDescription"),
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <AuthForm mode="login" {...(redirect ? { redirectTo: redirect } : {})} />;
}
