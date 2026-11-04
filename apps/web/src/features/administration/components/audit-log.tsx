import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@raypx/ui/components/ui/dialog";
import { Badge } from "@raypx/ui/components/ui/badge";
import { EmptyState } from "@raypx/ui/empty-state";
import { LoadingState } from "@raypx/ui/loading-state";
import { administrationClient } from "../client";
import { authClient, apiUrl } from "../../auth/client";

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
    t = useTranslations("administration");
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
    if (query.isError) return <p role="alert">{c("networkError")}</p>;
    if (!query.data) return <LoadingState label={c("loading")} />;
    if (!query.data.entries.length) return <EmptyState title={t("noAudit")} />;
    return (
      <Table aria-label={t("nav.auditLog")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("time")}</TableHead>
            <TableHead>{t("actor")}</TableHead>
            <TableHead>{t("action")}</TableHead>
            <TableHead>{t("outcome")}</TableHead>
            <TableHead>
              <span className="sr-only">{c("actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data.entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <time dateTime={entry.startedAt}>
                  {entry.startedAt.replace("T", " ").slice(0, 19)} UTC
                </time>
              </TableCell>
              <TableCell className="max-w-40 whitespace-normal wrap-anywhere">
                {entry.actorId ?? t("operator")}
              </TableCell>
              <TableCell>
                {t(entry.action === "user.role.update" ? "roleUpdate" : "configurationUpdate")}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{t(entry.outcome)}</Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" onClick={() => setSelected(entry)}>
                  {t("details")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <h1>{t("nav.auditLog")}</h1>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {c("refresh")}
        </Button>
      </header>
      <form
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
          <Field>
            <FieldLabel htmlFor="audit-from">{t("from")} (UTC)</FieldLabel>
            <Input
              id="audit-from"
              type="date"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-to">{t("to")} (UTC)</FieldLabel>
            <Input
              id="audit-to"
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
            <FieldLabel htmlFor="audit-action">{t("action")}</FieldLabel>
            <SelectField
              id="audit-action"
              value={action}
              onValueChange={setAction}
              options={[
                { value: "", label: t("all") },
                { value: "user.role.update", label: t("roleUpdate") },
                { value: "configuration.update", label: t("configurationUpdate") },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-outcome">{t("outcome")}</FieldLabel>
            <SelectField
              id="audit-outcome"
              value={outcome}
              onValueChange={setOutcome}
              options={[
                { value: "", label: t("all") },
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
        {invalid && <p role="alert">{t("invalidRange")}</p>}
      </form>
      {renderResults()}
      <nav aria-label={t("auditPages")} className="flex gap-3">
        <Button
          variant="outline"
          disabled={cursors.length < 2 || query.isFetching}
          onClick={() => setCursors((current) => current.slice(0, -1))}
        >
          {t("previous")}
        </Button>
        <Button
          variant="outline"
          disabled={!query.data?.next || query.isFetching}
          onClick={() => {
            if (query.data?.next) setCursors((current) => [...current, query.data.next]);
          }}
        >
          {t("next")}
        </Button>
      </nav>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent closeLabel={c("close")} className="max-h-[85dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t("details")}</DialogTitle>
          </DialogHeader>
          {selected && (
            <dl className="flex flex-col gap-3 text-sm wrap-anywhere">
              {[
                [t("actor"), selected.actorId ?? t("operator")],
                [t("target"), selected.targetId ?? "—"],
                [t("requestId"), selected.requestId],
                [t("outcome"), t(selected.outcome)],
                [t("errorCode"), selected.errorCode ?? "—"],
                [t("before"), JSON.stringify(selected.before)],
                [t("after"), JSON.stringify(selected.after)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium">{label}</dt>
                  <dd className="text-muted-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
