import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@raypx/ui/components/ui/empty";
import { cn } from "@raypx/ui/lib/utils";
import {
  ArrowRight,
  ChevronRight,
  FilePenLine,
  Inbox,
  MonitorSmartphone,
  Palette,
} from "lucide-react";

export function LandingHome() {
  const t = useTranslations("guest");
  const entries = [
    { key: "approvals", to: "/approvals", icon: Inbox },
    { key: "preferences", to: "/settings", icon: Palette },
  ] as const;
  return (
    <section aria-labelledby="landing-home-title" className="flex flex-col gap-6">
      <div className="grid overflow-hidden rounded-2xl border border-border @3xl/main:grid-cols-[1.3fr_1fr]">
        <header className="flex flex-col items-start gap-6 bg-muted/30 p-6 @xl/main:p-10">
          <div className="flex flex-col gap-3">
            <h1
              id="landing-home-title"
              className="text-3xl font-semibold tracking-tight @xl/main:text-4xl"
            >
              {t("title")}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
          </div>
          <Link
            to="/tasks"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-auto min-h-11 max-w-full whitespace-normal",
            )}
          >
            <FilePenLine data-icon="inline-start" aria-hidden="true" />
            {t("writeDraft")}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </header>
        <Empty className="rounded-none border-t border-border p-6 @xl/main:p-10 @3xl/main:border-t-0 @3xl/main:border-l">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MonitorSmartphone aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              <h2>{t("computers")}</h2>
            </EmptyTitle>
            <EmptyDescription>{t("computersHint")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              to="/login"
              search={{ returnTo: "/settings" }}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto min-h-11 max-w-full whitespace-normal text-center",
              )}
            >
              {t("connect")}
            </Link>
          </EmptyContent>
        </Empty>
      </div>
      <ul className="grid gap-3 @2xl/main:grid-cols-2">
        {entries.map(({ key, to, icon: Icon }) => (
          <li key={key}>
            <Link
              to={to}
              className="group flex h-full items-center gap-4 rounded-xl border border-border p-5 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(key)}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {t(`${key}Hint`)}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
