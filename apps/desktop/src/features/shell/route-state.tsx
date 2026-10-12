import { Alert, AlertDescription } from "@voidmix/ui/components/ui/alert";
import { LoadingState } from "@voidmix/ui/loading-state";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@voidmix/ui/components/ui/button";
import { IconButton } from "@voidmix/ui/icon-button";
import { useDesktopTranslations } from "../../i18n/client";

export function RefreshButton({ routeId }: { routeId: string }) {
  const t = useDesktopTranslations("overview");
  const router = useRouter();
  const loading = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === routeId && Boolean(match.isFetching)),
  });
  return (
    <IconButton
      label={t(loading ? "refreshing" : "refresh")}
      variant="outline"
      disabled={loading}
      aria-busy={loading}
      onClick={() => void router.invalidate({ filter: (match) => match.routeId === routeId })}
    >
      <ArrowsClockwise
        aria-hidden="true"
        className={loading ? "animate-spin motion-reduce:animate-none" : undefined}
      />
    </IconButton>
  );
}

export function DesktopRoutePending() {
  const t = useDesktopTranslations("common");
  return (
    <div className="page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold [&_p]:wrap-anywhere [&_[data-slot=badge]]:text-[12px]">
      <LoadingState label={t("loading")} />
    </div>
  );
}

export function DesktopRouteError() {
  const t = useDesktopTranslations("common");
  const errors = useDesktopTranslations("errors");
  const router = useRouter();
  return (
    <div className="page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold [&_p]:wrap-anywhere [&_[data-slot=badge]]:text-[12px]">
      <Alert variant="destructive">
        <AlertDescription>{errors("unknown")}</AlertDescription>
      </Alert>
      <Button variant="secondary" onClick={() => void router.invalidate()}>
        {t("retry")}
      </Button>
    </div>
  );
}
