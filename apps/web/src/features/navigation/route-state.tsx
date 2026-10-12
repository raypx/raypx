import { Alert, AlertDescription } from "@voidmix/ui/components/ui/alert";
import { CaretLineLeft, CaretRight, WarningCircle } from "@phosphor-icons/react";
import { IconButton } from "@voidmix/ui/icon-button";
import { LoadingState } from "@voidmix/ui/loading-state";
import { translateKnownApiError } from "../../../i18n/api-errors";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@voidmix/ui/components/ui/button";
import { useTranslations } from "../../i18n/client";
export function RoutePending() {
  const t = useTranslations("navigation");
  return <LoadingState label={t("loading")} />;
}
export function RouteError({ error }: ErrorComponentProps) {
  const t = useTranslations("navigation");
  const router = useRouter();
  const errors = useTranslations("errors");
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <Alert variant="destructive">
        <WarningCircle aria-hidden="true" />
        <AlertDescription>{translateKnownApiError(error, errors) ?? t("failed")}</AlertDescription>
      </Alert>
      <Button onClick={() => void router.invalidate()}>{t("retry")}</Button>
    </div>
  );
}
export function PageNavigation({
  nextCursor,
  cursor,
  onNavigate,
}: {
  nextCursor: string | null;
  cursor?: string | undefined;
  onNavigate: (cursor?: string) => void;
}) {
  const t = useTranslations("navigation");
  return (
    <nav aria-label={t("pagination")} className="flex justify-end gap-2">
      {cursor ? (
        <IconButton label={t("first")} variant="outline" onClick={() => onNavigate()}>
          <CaretLineLeft aria-hidden="true" />
        </IconButton>
      ) : null}
      {nextCursor ? (
        <IconButton label={t("next")} variant="outline" onClick={() => onNavigate(nextCursor)}>
          <CaretRight aria-hidden="true" />
        </IconButton>
      ) : null}
    </nav>
  );
}
export function pageSearch(input: Record<string, unknown>): { cursor?: string } {
  return typeof input.cursor === "string" && input.cursor ? { cursor: input.cursor } : {};
}
