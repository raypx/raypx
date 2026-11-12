import { useTranslations } from "../../../i18n.js";
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Read-only audit snapshots need keyboard scrolling. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { AuditEntry, AuditFilter } from "@raypx/contracts/api";
import { Input } from "@raypx/ui/components/ui/input";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { SelectField } from "@raypx/ui/select-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@raypx/ui/components/ui/dialog";
import { StatusBadge, type StatusTone } from "@raypx/ui/status-badge";
import { PageHeader } from "@raypx/ui/page-header";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { IconButton } from "@raypx/ui/icon-button";
import { RefreshIcon } from "@raypx/icons/refresh";
import { EyeIcon } from "@raypx/icons/eye";
import { EmptyState } from "@raypx/ui/empty-state";
import { LoadingState } from "@raypx/ui/loading-state";
import { administrationClient } from "../client.js";
import { authClient, apiUrl } from "../../auth/client.js";

const outcomeTones: Record<AuditEntry["outcome"], StatusTone> = {
  success: "success",
  failed: "danger",
  rejected: "warning",
  pending: "neutral",
  unknown: "warning",
};
function actionLabel(action: AuditEntry["action"]) {
  if (action === "user.role.update") return "roleUpdate";
  return "configurationUpdate";
}
function AuditSnapshot({ label, value }: { label: string; value: AuditEntry["before"] }) {
  return (
    <section className="min-w-0 space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <pre
        role="region"
        aria-label={label}
        tabIndex={0}
        className="max-h-72 min-h-24 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere focus-visible:-outline-offset-2"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

type Cursor = NonNullable<AuditFilter["cursor"]>;
function dateRange(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`),
    end = Date.parse(`${to}T00:00:00Z`) + 86400000;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end - start > 366 * 86400000
  )
    return undefined;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}
export function AuditLog() {
  const c = useTranslations("common"),
    t = useTranslations("dash");
  const session = authClient.useSession();
  const [initialRange] = useState(() => {
    const now = Date.now();
    return {
      from: new Date(now - 30 * 86400000).toISOString().slice(0, 10),
      to: new Date(now).toISOString().slice(0, 10),
    };
  });
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const [action, setAction] = useState<"" | AuditEntry["action"]>("");
  const [outcome, setOutcome] = useState<"" | AuditEntry["outcome"]>("");
  const [filters, setFilters] = useState<AuditFilter>(() => ({
    limit: 50,
    ...dateRange(initialRange.from, initialRange.to),
  }));
  const [cursors, setCursors] = useState<(Cursor | null)[]>([null]);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [invalid, setInvalid] = useState(false);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ["admin-audit", apiUrl, session.data?.user.id, filters, cursor],
    queryFn: ({ signal }) =>
      administrationClient.audit({ ...filters, ...(cursor ? { cursor } : {}) }, { signal }),
    enabled: Boolean(session.data?.user.id),
    retry: false,
  });
  function renderResults() {
    if (query.isError)
      return (
        <Alert variant="destructive">
          <AlertDescription>{c("networkError")}</AlertDescription>
        </Alert>
      );
    if (!query.data) return <LoadingState label={c("loading")} />;
    if (!query.data.entries.length) return <EmptyState title={t("noAudit")} />;
    return (
      <Table aria-label={t("nav.audit")}>
        <caption className="sr-only">UTC</caption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("time")}</TableHead>
            <TableHead>{t("actor")}</TableHead>
            <TableHead>{c("action")}</TableHead>
            <TableHead>{c("result")}</TableHead>
            <TableHead>
              <span className="sr-only">{c("actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data.entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-xs tabular-nums">
                <time dateTime={entry.startedAt}>
                  {entry.startedAt.replace("T", " ").slice(0, 19)} UTC
                </time>
              </TableCell>
              <TableCell className="max-w-40 whitespace-normal wrap-anywhere">
                {entry.actorId ?? t("operator")}
              </TableCell>
              <TableCell>{t(actionLabel(entry.action))}</TableCell>
              <TableCell>
                <StatusBadge label={t(entry.outcome)} tone={outcomeTones[entry.outcome]} />
              </TableCell>
              <TableCell>
                <IconButton label={t("details")} onClick={() => setSelected(entry)}>
                  <EyeIcon aria-hidden="true" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t("nav.audit")}
        action={
          <IconButton
            label={c("refresh")}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshIcon aria-hidden="true" />
          </IconButton>
        }
      />
      <form
        className="rounded-xl border border-border bg-sidebar p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const range = dateRange(from, to);
          if (!range) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          setCursors([null]);
          setFilters({
            limit: 50,
            ...range,
            ...(actor.trim() ? { actorId: actor.trim() } : {}),
            ...(target.trim() ? { targetId: target.trim() } : {}),
            ...(action ? { action } : {}),
            ...(outcome ? { outcome } : {}),
          });
        }}
      >
        <FieldGroup className="grid gap-3 sm:grid-cols-2 @3xl/main:grid-cols-3">
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="audit-from">{t("from")} (UTC)</FieldLabel>
            <Input
              id="audit-from"
              aria-invalid={invalid}
              aria-describedby={invalid ? "audit-range-error" : undefined}
              type="date"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="audit-to">{t("to")} (UTC)</FieldLabel>
            <Input
              id="audit-to"
              aria-invalid={invalid}
              aria-describedby={invalid ? "audit-range-error" : undefined}
              type="date"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-actor">{t("actor")}</FieldLabel>
            <Input
              id="audit-actor"
              value={actor}
              maxLength={128}
              onChange={(event) => setActor(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-target">{t("target")}</FieldLabel>
            <Input
              id="audit-target"
              value={target}
              maxLength={128}
              onChange={(event) => setTarget(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-action">{c("action")}</FieldLabel>
            <SelectField
              id="audit-action"
              value={action}
              onValueChange={setAction}
              options={[
                { value: "", label: c("all") },
                { value: "user.role.update", label: t("roleUpdate") },
                { value: "configuration.update", label: t("configurationUpdate") },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-outcome">{c("result")}</FieldLabel>
            <SelectField
              id="audit-outcome"
              value={outcome}
              onValueChange={setOutcome}
              options={[
                { value: "", label: c("all") },
                ...(["success", "rejected", "failed", "pending", "unknown"] as const).map(
                  (value) => ({ value, label: t(value) }),
                ),
              ]}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" className="mt-3">
          {t("applyFilters")}
        </Button>
        {invalid && (
          <p id="audit-range-error" role="alert" className="mt-3 text-sm text-destructive-text">
            {t("invalidRange")}
          </p>
        )}
      </form>
      <div aria-busy={query.isFetching} className="min-w-0">
        {renderResults()}
      </div>
      <nav
        aria-label={t("auditPages")}
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
      >
        <p aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
          {query.data && !query.isError && t("auditPage", { page: String(cursors.length) })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={cursors.length < 2 || query.isFetching}
            onClick={() => setCursors((current) => current.slice(0, -1))}
          >
            {c("previousPage")}
          </Button>
          <Button
            variant="outline"
            disabled={!query.data?.next || query.isFetching}
            onClick={() => {
              if (query.data?.next) setCursors((current) => [...current, query.data.next]);
            }}
          >
            {c("nextPage")}
          </Button>
        </div>
      </nav>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent closeLabel={c("close")} className="max-h-[85dvh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("details")}</DialogTitle>
            {selected && (
              <DialogDescription>
                <time dateTime={selected.startedAt}>
                  {selected.startedAt.replace("T", " ").replace(/Z$/, " UTC")}
                </time>
              </DialogDescription>
            )}
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{t(actionLabel(selected.action))}</h2>
                <StatusBadge label={t(selected.outcome)} tone={outcomeTones[selected.outcome]} />
              </div>
              <dl className="grid gap-x-6 text-sm wrap-anywhere sm:grid-cols-2">
                {[
                  [t("actor"), selected.actorId ?? t("operator")],
                  [t("target"), selected.targetId ?? "—"],
                  [t("requestId"), selected.requestId],
                  [t("errorCode"), selected.errorCode ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 space-y-1 border-b border-border py-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 select-text">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <AuditSnapshot label={t("before")} value={selected.before} />
                <AuditSnapshot label={t("after")} value={selected.after} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
