import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeReturnTo } from "../../../features/auth/return-to";
import { SessionBoundary, SignInGate } from "../../../features/auth/components/session-boundary";
import { useTranslations } from "@raypx/i18n/browser";
import { ConfigurationSettings } from "../../../features/configuration/components/settings";

export const Route = createFileRoute("/(app)/admin/settings")({
  staticData: { page: { title: "common.adminSettings", layout: "document" } },
  beforeLoad: ({ context, location }) => {
    if (context.account.status === "signed-out")
      throw redirect({ to: "/login", search: { returnTo: safeReturnTo(location.href) } });
  },
  component: Page,
});
function Page() {
  const g = useTranslations("guest");
  return (
    <SessionBoundary
      guest={<SignInGate title={g("privateTitle")} description={g("privateHint")} />}
    >
      {() => <ConfigurationSettings />}
    </SessionBoundary>
  );
}
