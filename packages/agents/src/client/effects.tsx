import { useEffect, useState } from "react";
import type { Effect } from "@raypx/core/approvals";
import type { RunId } from "@raypx/core/conversation";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@raypx/ui/components/ui/dialog";
import type { ApprovalPort, ConversationSelection } from "../model.js";
import { toolDisplayLabel } from "../model/tool-label.js";
import { useTranslations } from "./i18n.js";

export function EffectRecords({
  port,
  selection,
  runId,
}: {
  port: ApprovalPort;
  selection: ConversationSelection;
  runId: RunId;
}) {
  const t = useTranslations("agents");
  const [open, setOpen] = useState(false);
  const [effects, setEffects] = useState<Effect[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void port
      .effects({ spaceId: selection.spaceId, runId })
      .then((records) => {
        if (!cancelled) setEffects(records);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, port, selection.spaceId, runId, refresh]);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setEffects(null);
          setFailed(false);
          setOpen(true);
        }}
      >
        {t("effects.open")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t("close")}
          className="min-w-0 motion-reduce:animate-none"
          backdropProps={{ className: "motion-reduce:animate-none" }}
        >
          <DialogHeader>
            <DialogTitle>{t("effects.title")}</DialogTitle>
            <DialogDescription>{t("effects.description")}</DialogDescription>
          </DialogHeader>
          {failed && (
            <div role="status" className="flex flex-col gap-2">
              <p>{t("effects.error")}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFailed(false);
                  setRefresh((value) => value + 1);
                }}
              >
                {t("refresh")}
              </Button>
            </div>
          )}
          {!failed && effects === null && <p role="status">{t("loading")}</p>}
          {effects?.length === 0 && <p>{t("effects.empty")}</p>}
          <ul className="flex min-w-0 flex-col gap-3">
            {effects?.map((effect) => (
              <li key={effect.key} className="flex min-w-0 flex-col gap-1 border-b pb-3 text-xs">
                <span className="font-medium">{toolDisplayLabel(effect.toolName, t)}</span>
                <span>{t(`effects.states.${effect.state}`)}</span>
                <time
                  className="tabular-nums wrap-anywhere"
                  dateTime={effect.completedAt ?? effect.createdAt}
                >
                  {effect.completedAt ?? effect.createdAt}
                </time>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
