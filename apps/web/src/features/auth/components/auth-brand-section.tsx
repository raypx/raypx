import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import type { IconComponent } from "@raypx/icons";
import { useTranslations } from "@raypx/i18n/browser";

export function AuthBrandSection() {
  const t = useTranslations("auth");
  return (
    <aside className="hidden min-w-0 flex-col justify-center border-l border-border bg-muted/30 p-10 lg:flex">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
            {t("brandTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("brandIntro")}</p>
        </div>
        <ul className="flex flex-col gap-5">
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
    <li className="flex items-start gap-3 text-sm leading-relaxed">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      {text}
    </li>
  );
}
