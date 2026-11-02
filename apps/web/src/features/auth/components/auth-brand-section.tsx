import { Link } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import { useTranslations } from "@raypx/i18n/browser";

interface AuthBrandSectionProps {
  siteName: string;
}

export function AuthBrandSection({ siteName }: AuthBrandSectionProps) {
  const t = useTranslations("auth");

  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-muted via-muted/80 to-muted/50 lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="relative z-10 space-y-8">
        <Link
          to="/"
          aria-label={siteName}
          className="inline-flex min-w-0 max-w-full transition-opacity hover:opacity-80"
        >
          <Logo label={siteName} className="max-w-full text-xl [&>span]:truncate" />
        </Link>
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">{t("brandTitle")}</h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {t("brandIntro")}
          </p>
        </div>
      </div>

      {/* Decorative gradient orbs */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-[32rem] rounded-full bg-gradient-to-br from-primary/15 to-primary/5 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-24 -bottom-24 size-96 rounded-full bg-gradient-to-tr from-primary/10 to-transparent blur-3xl"
        aria-hidden="true"
      />

      {/* Feature highlights */}
      <div className="relative z-10 space-y-4 opacity-60">
        <FeatureItem text={t("featureLocal")} />
        <FeatureItem text={t("featureSync")} />
        <FeatureItem text={t("featureCollaboration")} />
      </div>
    </aside>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 size-1.5 shrink-0 rounded-full bg-current" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
