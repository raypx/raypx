import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { ChevronRight, FilePenLine, Inbox, Palette } from "lucide-react";
import { SignInLink } from "./session-boundary";

export function GuestHome() {
  const t = useTranslations("guest");
  const entries = [
    { key: "draft", to: "/tasks", icon: FilePenLine },
    { key: "approvals", to: "/approvals", icon: Inbox },
    { key: "preferences", to: "/settings", icon: Palette },
  ] as const;
  return (
    <section>
      <h1>{t("title")}</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">{t("intro")}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/tasks" className={cn(buttonVariants())}>
          <FilePenLine aria-hidden="true" />
          {t("writeDraft")}
        </Link>
        <SignInLink variant="outline" returnTo="/settings">
          {t("connect")}
        </SignInLink>
      </div>
      <ul className="mt-8 grid gap-3 @2xl/main:grid-cols-3">
        {entries.map(({ key, to, icon: Icon }) => (
          <li key={key}>
            <Link
              to={to}
              className="group flex h-full items-start gap-3 rounded-xl border border-border p-4 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon aria-hidden="true" className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(key)}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {t(`${key}Hint`)}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
