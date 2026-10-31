import { useTranslations } from "@raypx/i18n/browser";
export function Gate({ pending }: { pending?: boolean }) {
  const t = useTranslations("tasks");
  return (
    <div className="py-10" aria-busy={pending}>
      {pending ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <h2>{t("signIn")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("signInHint")}</p>
        </>
      )}
    </div>
  );
}
