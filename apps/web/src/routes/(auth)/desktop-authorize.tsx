import { createFileRoute } from "@tanstack/react-router";
import { desktopOAuthQuerySchema } from "@raypx/contracts/api";
import { DesktopAuthorization } from "../../features/auth/components/desktop-authorization.js";

export const Route = createFileRoute("/(auth)/desktop-authorize")({
  validateSearch: (search: Record<string, unknown>): { oauth?: string } => {
    const oauth = desktopOAuthQuerySchema.safeParse(search.oauth);
    return oauth.success ? { oauth: oauth.data } : {};
  },
  headers: () => ({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
  }),
  component: DesktopAuthorizationPage,
});

function DesktopAuthorizationPage() {
  const search = Route.useSearch();
  return <DesktopAuthorization key={search.oauth} {...search} />;
}
