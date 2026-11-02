import { Link } from "@tanstack/react-router";
import { FolderCode, Monitor, ShieldCheck, type LucideIcon } from "lucide-react";
import { Logo } from "@raypx/ui/logo";
import { useTranslations } from "@raypx/i18n/browser";

interface AuthBrandSectionProps {
  siteName: string;
}

export function AuthBrandSection({ siteName }: AuthBrandSectionProps) {
  const t = useTranslations("auth");

  return (
    <aside className="hidden flex-col justify-between gap-16 border-r border-border bg-muted/40 p-10 lg:flex xl:p-16">
      <Link
        to="/"
        aria-label={siteName}
        className="inline-flex max-w-full self-start rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo label={siteName} className="max-w-full [&>span]:truncate" />
      </Link>
      <div className="flex max-w-md flex-col gap-6 py-12">
        <div
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-2xl border border-border bg-background"
        >
          <FolderCode size={28} strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
          {t("brandTitle")}
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">{t("brandIntro")}</p>
      </div>
      <ul className="flex flex-col gap-5">
        <FeatureItem icon={Monitor} text={t("featureLocal")} />
        <FeatureItem icon={FolderCode} text={t("featureRemote")} />
        <FeatureItem icon={ShieldCheck} text={t("featureApprovals")} />
      </ul>
    </aside>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-muted-foreground">
      <Icon size={18} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
      {text}
    </li>
  );
}
