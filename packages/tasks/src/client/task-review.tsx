import type { TaskReview as Review } from "@raypx/core/tasks";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useTranslations } from "./i18n.js";

function Snapshot({ snapshot }: { snapshot: Review["before"] }) {
  const t = useTranslations("tasks");
  if (!snapshot) return <p className="text-sm text-muted-foreground">{t("reviewUnavailable")}</p>;
  return (
    <div className="grid min-w-0 gap-2">
      <code className="break-all text-xs text-muted-foreground">{snapshot.revision}</code>
      {snapshot.patch ? (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
          {snapshot.patch}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{t("reviewClean")}</p>
      )}
      {!!snapshot.untracked.length && (
        <>
          <p className="text-sm text-muted-foreground">{t("reviewUntracked")}</p>
          <ul className="grid gap-1 break-all font-mono text-xs">
            {snapshot.untracked.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function TaskReview({ review }: { review: Review }) {
  const t = useTranslations("tasks");
  const same =
    review.before &&
    review.after &&
    review.before.revision === review.after.revision &&
    review.before.patch === review.after.patch &&
    JSON.stringify(review.before.untracked) === JSON.stringify(review.after.untracked);
  return (
    <Collapsible className="grid gap-2 rounded-xl border p-3">
      <CollapsibleTrigger render={<Button variant="ghost" className="justify-self-start" />}>
        {t("reviewTitle")}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3">
        <h4 className="text-sm font-medium">{t("reviewBefore")}</h4>
        <Snapshot snapshot={review.before} />
        <h4 className="text-sm font-medium">{t("reviewAfter")}</h4>
        {same ? (
          <p className="text-sm text-muted-foreground">{t("reviewSame")}</p>
        ) : (
          <Snapshot snapshot={review.after} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
