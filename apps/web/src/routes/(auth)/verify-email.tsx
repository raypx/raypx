import { createFileRoute } from "@tanstack/react-router";
import { VerifyEmail } from "../../features/auth/verify-email";
import { validateAuthSearch } from "../../features/auth/route-search";
import { localizedRouteHead } from "../../i18n/route-meta";

export const Route = createFileRoute("/(auth)/verify-email")({
  validateSearch: (search: Record<string, unknown>) => {
    const authSearch = validateAuthSearch(search);
    const token = typeof search.token === "string" && search.token ? search.token : undefined;
    const verified = search.verified === "1" || search.verified === true;
    const verificationFailed = typeof search.error === "string" && search.error.length > 0;
    return {
      ...authSearch,
      ...(token ? { token } : {}),
      ...(verified ? { verified: true } : {}),
      ...(verificationFailed ? { verificationFailed: true } : {}),
    };
  },
  component: VerifyEmailRoute,
  head: ({ matches }) => localizedRouteHead(matches, "verifyEmailTitle", "verifyEmailDescription"),
});

function VerifyEmailRoute() {
  const { redirect, token, verified, verificationFailed } = Route.useSearch();
  return (
    <VerifyEmail
      {...(redirect ? { redirectTo: redirect } : {})}
      {...(token ? { token } : {})}
      {...(verified ? { verified: true } : {})}
      {...(verificationFailed ? { verificationFailed: true } : {})}
    />
  );
}
