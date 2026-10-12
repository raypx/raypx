import { Link } from "@tanstack/react-router";
import { MagnifyingGlass, Files, Cloud } from "@phosphor-icons/react";
import { buttonVariants } from "@voidmix/ui/components/ui/button";
import { Logo } from "@voidmix/ui/logo";
import { LanguageSwitcher } from "../../components/language-switcher";
import { useTranslations } from "../../i18n/client";

export function PublicHome() {
  const t = useTranslations("cloudMarketing");
  const features = [
    { icon: MagnifyingGlass, title: t("searchTitle"), text: t("searchDescription") },
    { icon: Cloud, title: t("computerTitle"), text: t("computerDescription") },
    { icon: Files, title: t("deliveryTitle"), text: t("deliveryDescription") },
  ];
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
        <Link to="/" aria-label="Voidmix">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4">
          <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground">
            {t("docs")}
          </Link>
          <LanguageSwitcher />
          <Link className={buttonVariants({ variant: "outline" })} to="/chat">
            {t("start")}
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5">
        <section className="max-w-3xl py-20 sm:py-32">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            {t("description")}
          </p>
          <Link to="/chat" className={`${buttonVariants({ size: "lg" })} mt-8`}>
            {t("start")}
          </Link>
        </section>
        <section className="grid gap-8 border-y border-border py-12 md:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <Icon aria-hidden="true" className="mb-5 size-6 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{text}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-5 px-5 py-10 text-sm text-muted-foreground">
        <p>{t("footer")}</p>
        <div className="flex gap-5">
          <Link to="/docs">{t("docs")}</Link>
          <Link to="/privacy">{t("privacy")}</Link>
          <Link to="/contact">{t("contact")}</Link>
        </div>
      </footer>
    </div>
  );
}
