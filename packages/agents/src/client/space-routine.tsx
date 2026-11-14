import { useEffect, useMemo, useState } from "react";
import { RoutinesPanel } from "@raypx/jobs/client";
import type { RoutinesPort } from "@raypx/jobs/model";
import type { Routine } from "@raypx/core/routines";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "./i18n.js";

/** Open the returned shared routine through its existing editor and takeover flow. */
export function PausedRoutinePanel({
  id,
  spaceId,
  accountId,
  port,
}: {
  id: string;
  spaceId: string;
  accountId: string;
  origin: string;
  port: RoutinesPort;
}) {
  const t = useTranslations("agents");
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void port
      .get({ spaceId, id })
      .then((value) => {
        if (active) setRoutine(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [port, spaceId, id]);
  const selected = useMemo<RoutinesPort>(
    () => ({
      list: async (input) => [await port.get({ spaceId: input.spaceId, id })],
      get: (input) => port.get(input),
      create: (input) => port.create(input),
      update: (input) => port.update(input),
      pause: (input) => port.pause(input),
      resume: (input) => port.resume(input),
      delete: (input) => port.delete(input),
      test: (input) => port.test(input),
      rotateWebhookKey: (input) => port.rotateWebhookKey(input),
      history: (input) => port.history(input),
      events: (input) => port.events(input),
    }),
    [port, id],
  );
  if (failed) return <p role="alert">{t("directoryError")}</p>;
  if (!routine) return <LoadingState label={t("loading")} />;
  return (
    <RoutinesPanel
      showTitle={false}
      spaceId={spaceId}
      agentId={routine.agentId}
      accountId={accountId}
      port={selected}
      onOpenRun={() => {}}
    />
  );
}
