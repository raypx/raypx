import type { ComputerFileResult, ToolActivity } from "@raypx/core/conversation";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { EditIcon } from "@raypx/icons/edit";
import { SearchIcon } from "@raypx/icons/search";
import { Button } from "@raypx/ui/components/ui/button";
import { CapabilitySheet } from "./capability-sheet.js";
import { useTranslations } from "./i18n.js";

type Search = Extract<ComputerFileResult, { kind: "search" }>;
type Edit = Extract<ComputerFileResult, { kind: "edit" }>;

function SearchMatches({ matches }: { matches: Search["matches"] }) {
  return (
    <ul className="flex min-w-0 flex-col divide-y">
      {matches.map(({ path, line, text }) => (
        <li key={JSON.stringify([path, line])} className="min-w-0 space-y-1 py-2">
          <code dir="ltr" className="block text-xs font-medium wrap-anywhere">
            {path}:{line}
          </code>
          {text && (
            <code
              dir="ltr"
              className="block text-xs whitespace-pre-wrap wrap-anywhere text-muted-foreground"
            >
              {text}
            </code>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ComputerFileCards({
  activity,
  delegated,
  onOpen,
}: {
  activity: readonly ToolActivity[];
  delegated: readonly { activity: readonly ToolActivity[] }[];
  onOpen: (result: ComputerFileResult, opener: HTMLButtonElement) => void;
}) {
  const t = useTranslations("agents");
  return [...activity, ...delegated.flatMap((work) => work.activity)].map((call) => {
    const result = call.fileResult;
    if (!result || call.outcome !== "succeeded") return null;
    const search = result.kind === "search";
    const Icon = search ? SearchIcon : EditIcon;
    return (
      <section
        key={JSON.stringify([call.runId, call.toolCallId])}
        aria-label={t(search ? "fileResult.searchTitle" : "fileResult.editTitle")}
        className="flex w-full max-w-xl min-w-0 flex-col rounded-lg border px-3 py-2"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {search ? (
              t("fileResult.matches", { count: result.matches.length })
            ) : (
              <code dir="ltr" className="text-xs wrap-anywhere">
                {result.path}
              </code>
            )}
          </div>
          {(!search || result.matches.length > 0) && (
            <Button
              size="sm"
              variant="ghost"
              aria-haspopup="dialog"
              className="min-h-11 shrink-0"
              onClick={(event) => onOpen(result, event.currentTarget)}
            >
              {t(search ? "fileResult.viewMatches" : "fileResult.viewDiff")}
              <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          )}
        </div>
        {search && (
          <>
            <SearchMatches matches={result.matches.slice(0, 2)} />
            {result.truncated && (
              <p className="text-xs text-muted-foreground">{t("fileResult.searchPartial")}</p>
            )}
          </>
        )}
      </section>
    );
  });
}

function FileDiff({ result }: { result: Edit }) {
  const t = useTranslations("agents");
  return (
    <>
      <p className="font-mono text-sm wrap-anywhere" dir="ltr">
        {result.path}
      </p>
      <div className="flex min-w-0 flex-col gap-3">
        {result.hunks.map(({ oldStart, newStart, lines }) => {
          let oldLine = oldStart;
          let newLine = newStart;
          return (
            <div key={`${oldStart}:${newStart}`} className="overflow-hidden rounded-md border">
              <table
                className="w-full table-fixed text-left font-mono text-xs leading-relaxed"
                dir="ltr"
              >
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-14 px-2 py-1 text-right font-medium">
                      {t("fileResult.before")}
                    </th>
                    <th scope="col" className="w-14 px-2 py-1 text-right font-medium">
                      {t("fileResult.after")}
                    </th>
                    <th scope="col" className="px-2 py-1 font-medium">
                      {t("fileResult.change")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const prefix = line[0];
                    const addition = prefix === "+";
                    const removal = prefix === "-";
                    const marker = prefix === "\\";
                    let tone = "";
                    if (addition) tone = "bg-success-bg text-success-text";
                    if (removal) tone = "bg-danger-bg text-danger-text";
                    const old = addition || marker ? "" : oldLine++;
                    const next = removal || marker ? "" : newLine++;
                    return (
                      <tr key={index} className={tone}>
                        <td className="px-2 text-right align-top text-muted-foreground tabular-nums">
                          {old}
                        </td>
                        <td className="px-2 text-right align-top text-muted-foreground tabular-nums">
                          {next}
                        </td>
                        <td className="px-2 whitespace-pre-wrap wrap-anywhere">
                          {marker ? t("fileResult.noNewline") : line}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      {result.truncated && (
        <p className="text-sm text-muted-foreground">{t("fileResult.diffPartial")}</p>
      )}
    </>
  );
}

export function ComputerFileSheet({
  result,
  open,
  onClose,
  finalFocus,
}: {
  result: ComputerFileResult;
  open: boolean;
  onClose: () => void;
  finalFocus: () => HTMLElement | false;
}) {
  const t = useTranslations("agents");
  const search = result.kind === "search";
  return (
    <CapabilitySheet
      open={open}
      onClose={onClose}
      finalFocus={finalFocus}
      title={t(search ? "fileResult.searchTitle" : "fileResult.editTitle")}
      closeLabel={t("close")}
      className="data-[side=right]:w-full sm:data-[side=right]:max-w-2xl"
    >
      {search ? (
        <>
          <SearchMatches matches={result.matches} />
          {result.truncated && (
            <p className="text-sm text-muted-foreground">{t("fileResult.searchPartial")}</p>
          )}
        </>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <FileDiff result={result} />
        </div>
      )}
    </CapabilitySheet>
  );
}
