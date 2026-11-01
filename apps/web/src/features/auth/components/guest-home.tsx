import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { SignInLink } from "./session-boundary";

export function GuestHome() {
  const t = useTranslations("guest");
  return (
    <section>
      <h1>{t("title")}</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">{t("intro")}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button render={<Link to="/tasks" />}>{t("writeDraft")}</Button>
        <SignInLink variant="outline" returnTo="/settings">
          {t("connect")}
        </SignInLink>
      </div>
      <dl className="mt-10 divide-y divide-border border-y border-border">
        {(["draft", "approvals", "preferences"] as const).map((key) => (
          <div key={key} className="grid gap-1 py-4">
            <dt className="text-sm font-medium">{t(key)}</dt>
            <dd className="max-w-prose text-sm text-muted-foreground">{t(`${key}Hint`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
