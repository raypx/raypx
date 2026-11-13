import { useEffect, useSyncExternalStore } from "react";
import type { SpaceId } from "@raypx/core/spaces";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import type { SpaceJoinController } from "../model/space-management.js";
import { useTranslations } from "./i18n.js";

export function JoinSpaceView({
  controller,
  onJoined,
}: {
  controller: SpaceJoinController;
  onJoined: (spaceId: SpaceId) => void;
}) {
  const t = useTranslations("agents");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.preview();
  }, [controller]);
  useEffect(() => {
    if (state.status === "joined" && state.acceptance) onJoined(state.acceptance.space.id);
  }, [state.status, state.acceptance, onJoined]);
  if (state.status === "idle" || state.status === "loading")
    return <LoadingState label={t("loading")} />;
  if (state.status === "error")
    return (
      <section className="flex min-w-0 flex-col gap-4">
        <h1 className="text-2xl font-medium">{t("spaceSettings.joinTitle")}</h1>
        <p role="alert" className="text-sm">
          {t(`spaceSettings.errors.${state.error ?? "REQUEST_FAILED"}`)}
        </p>
      </section>
    );
  if (state.status === "joined")
    return (
      <p role="status" className="text-sm">
        {t("spaceSettings.joinedSpace")}
      </p>
    );
  const preview = state.preview;
  if (!preview) return null;
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t("spaceSettings.joinTitle")}>
      <h1 className="text-2xl font-medium wrap-anywhere">{preview.spaceName}</h1>
      <p className="text-sm wrap-anywhere">
        {t("spaceSettings.invitedBy", { name: preview.inviterName })}
      </p>
      {preview.alreadyMember ? (
        <p className="text-sm">{t("spaceSettings.alreadyMember")}</p>
      ) : (
        <>
          <p className="text-sm font-medium">{t("spaceSettings.joinShares")}</p>
          <ul className="list-inside list-disc space-y-2 text-sm">
            {preview.shares.map((share) => (
              <li key={share}>{t(`spaceSettings.shares.${share}`)}</li>
            ))}
          </ul>
          <p className="text-sm">{t("spaceSettings.personalItems")}</p>
        </>
      )}
      <p className="text-xs tabular-nums text-muted-foreground">
        {t("spaceSettings.expires", { date: new Date(preview.expiresAt).toLocaleString() })}
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(`spaceSettings.errors.${state.error}`)}
        </p>
      )}
      <Button
        className="self-start"
        disabled={state.status === "joining"}
        onClick={() => void controller.accept()}
      >
        {preview.alreadyMember ? t("spaceSettings.openSpace") : t("spaceSettings.joinSpace")}
      </Button>
    </section>
  );
}
