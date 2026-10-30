import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { SignInLink } from "./session-boundary";

export function GuestHome() {
  const t = useTranslations("guest");
  return (
    <section>
      <p className="mb-4 text-sm text-muted-foreground">{t("visitor")}</p>
      <h1>{t("title")}</h1>
      <p className="mt-3 max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Button render={<Link to="/tasks" />}>{t("writeDraft")}</Button>
        <SignInLink variant="outline" returnTo="/settings">
          {t("connect")}
        </SignInLink>
      </div>
      <dl className="mt-10 divide-y divide-border border-y border-border">
        {(["draft", "approvals", "preferences"] as const).map((key) => (
          <div key={key} className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr]">
            <dt className="font-medium">{t(key)}</dt>
            <dd className="max-w-[65ch] text-sm text-muted-foreground">{t(`${key}Hint`)}</dd>
          </div>
        ))}
      </dl>
      <Button className="mt-6" variant="outline" render={<Link to="/settings" />}>
        {t("preferences")}
      </Button>
    </section>
  );
}
