import { createFileRoute } from "@tanstack/react-router";
import { ResetPassword } from "../../features/auth/reset-password";
import { validateAuthSearch } from "../../features/auth/route-search";
import { localizedRouteHead } from "../../i18n/route-meta";

export const Route = createFileRoute("/(auth)/reset-password")({
  validateSearch: (search: Record<string, unknown>) => {
    const authSearch = validateAuthSearch(search);
    const token = typeof search.token === "string" && search.token ? search.token : undefined;
    return { ...authSearch, ...(token ? { token } : {}) };
  },
  component: ResetPasswordRoute,
  head: ({ matches }) =>
    localizedRouteHead(matches, "resetPasswordTitle", "resetPasswordDescription"),
});

function ResetPasswordRoute() {
  const { redirect, token } = Route.useSearch();
  return (
    <ResetPassword {...(redirect ? { redirectTo: redirect } : {})} {...(token ? { token } : {})} />
  );
}
