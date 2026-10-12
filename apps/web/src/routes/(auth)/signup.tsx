import { createFileRoute } from "@tanstack/react-router";

import { AuthForm } from "../../features/auth/auth-form";
import { validateAuthSearch } from "../../features/auth/route-search";
import { localizedRouteHead } from "../../i18n/route-meta";

export const Route = createFileRoute("/(auth)/signup")({
  validateSearch: validateAuthSearch,
  component: SignupRoute,
  head: ({ matches }) => localizedRouteHead(matches, "signupTitle", "signupDescription"),
});

function SignupRoute() {
  const { redirect } = Route.useSearch();
  return <AuthForm mode="signup" {...(redirect ? { redirectTo: redirect } : {})} />;
}
