import { Link } from "@tanstack/react-router";
import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import type { IconComponent } from "@raypx/icons";
import { Logo } from "@raypx/ui/logo";
import { useTranslations } from "@raypx/i18n/browser";

interface AuthBrandSectionProps {
  siteName: string;
}

export function AuthBrandSection({ siteName }: AuthBrandSectionProps) {
  const t = useTranslations("auth");
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-sidebar px-8 py-10 lg:flex xl:px-14">
      <Link
        to="/"
        aria-label={siteName}
        className="inline-flex max-w-full self-start rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo label={siteName} className="max-w-full [&>span]:truncate" />
      </Link>
      <div className="my-auto flex max-w-md flex-col gap-10 py-16">
        <div className="flex flex-col gap-4">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">
            {t("brandTitle")}
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">{t("brandIntro")}</p>
        </div>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          <FeatureItem icon={MonitorIcon} text={t("featureLocal")} />
          <FeatureItem icon={CodeFolderIcon} text={t("featureRemote")} />
          <FeatureItem icon={ShieldCheckIcon} text={t("featureApprovals")} />
        </ul>
      </div>
    </aside>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  return (
    <li className="flex items-start gap-3 py-4 text-sm leading-relaxed">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      {text}
    </li>
  );
}
