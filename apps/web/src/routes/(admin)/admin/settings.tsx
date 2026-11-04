import { webPageGuard, PageAccessFeedback } from "../../../features/auth/route-guard";
import { createFileRoute } from "@tanstack/react-router";
import { SessionBoundary, SignInGate } from "../../../features/auth/components/session-boundary";
import { useTranslations } from "@raypx/i18n/browser";
import { ConfigurationSettings } from "../../../features/configuration/components/settings";

export const Route = createFileRoute("/(admin)/admin/settings")({
  beforeLoad: webPageGuard("/admin/settings"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "site.title", layout: "document" } },
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
