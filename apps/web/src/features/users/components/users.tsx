import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { assignedRoles, type AuthRole } from "@raypx/auth/access";
import { hasPermission } from "@raypx/account/access";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/ui/table";
import { SelectField } from "@raypx/ui/select-field";
import { IconButton } from "@raypx/ui/icon-button";
import { LoadingState } from "@raypx/ui/loading-state";
import { EmptyState } from "@raypx/ui/empty-state";
import { HelpHint } from "@raypx/ui/help-hint";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { accountAccessQuery } from "../../auth/access";
import { authClient, apiUrl } from "../../auth/client";

const pageSize = 20;
type SearchField = "email" | "name";
type Selection = { id: string; email: string; role: AuthRole };

export function Users({ accountId }: { accountId: string }) {
  const c = useTranslations("common");
  const t = useTranslations("users");
  const locale = useLocale();
  const cache = useQueryClient();
  const [field, setField] = useState<SearchField>("email");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState({ field: "email" as SearchField, value: "" });
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [role, setRole] = useState<AuthRole>("member");
  const [busy, setBusy] = useState(false);
  const fence = useRef(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"forbidden" | "failed" | "refreshFailed" | null>(null);
  const access = useQuery(accountAccessQuery(accountId));
  const canChange =
    !access.isError &&
    access.data?.accountId === accountId &&
    hasPermission(access.data, "users.roles.update");
  const listKey = ["admin-users", apiUrl, accountId] as const;
  const users = useQuery({
    queryKey: [...listKey, search, offset],
    queryFn: async ({ signal }) => {
      const result = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset,
          sortBy: "createdAt",
          sortDirection: "desc",
          ...(search.value
            ? {
                searchValue: search.value,
                searchField: search.field,
                searchOperator: "contains" as const,
              }
            : {}),
        },
        fetchOptions: { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      });
      if (result.error)
        throw new Error(
          result.error.status === 403 || result.error.status === 401
            ? "FORBIDDEN"
            : "USERS_UNAVAILABLE",
        );
      if (!result.data) throw new Error("USERS_UNAVAILABLE");
      return result.data;
    },
    retry: false,
    staleTime: 0,
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: listKey }, { throwOnError: true }),
      cache.invalidateQueries({ queryKey: ["account-access"] }, { throwOnError: true }),
    ]);
  };
  async function saveRole() {
    if (!selection || selection.id === accountId || !canChange || fence.current) return;
    fence.current = true;
    setBusy(true);
    setError(null);
    let changed = saved;
    try {
      if (!changed) {
        const result = await authClient.admin.setRole({
          userId: selection.id,
          role,
          fetchOptions: { signal: AbortSignal.timeout(10_000) },
        });
        if (result.error) {
          setError(
            result.error.status === 403 || result.error.status === 401 ? "forbidden" : "failed",
          );
          if (result.error.status === 403 || result.error.status === 401)
            void cache.invalidateQueries({ queryKey: ["account-access"] });
          return;
        }
        changed = true;
        setSaved(true);
      }
      await refresh();
      setSelection(null);
    } catch {
      setError(changed ? "refreshFailed" : "failed");
    } finally {
      fence.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <h1>{c("users")}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setSearch({ field, value: draft.trim() });
        }}
      >
        <FieldGroup className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field className="sm:w-40 sm:shrink-0">
            <FieldLabel htmlFor="user-search-field">{t("searchBy")}</FieldLabel>
            <SelectField
              id="user-search-field"
              value={field}
              onValueChange={setField}
              options={[
                { value: "email", label: t("email") },
                { value: "name", label: c("name") },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="user-search">{t("search")}</FieldLabel>
            <Input
              id="user-search"
              value={draft}
              maxLength={320}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          <Button type="submit">{t("search")}</Button>
        </FieldGroup>
      </form>
      {users.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">
            {users.error.message === "FORBIDDEN" ? t("forbidden") : c("networkError")}
          </p>
          <Button variant="outline" onClick={() => void users.refetch()}>
            {c("retry")}
          </Button>
        </div>
      ) : users.isPending ? (
        <LoadingState label={c("loading")} />
      ) : users.data.users.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table aria-label={c("users")}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/2 @3xl/main:w-auto">{c("name")}</TableHead>
              <TableHead className="hidden @3xl/main:table-cell">{t("verification")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead className="hidden @3xl/main:table-cell">{t("created")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{c("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.data.users.map((user) => {
              const roles = assignedRoles(user.role);
              const currentRole = roles.includes("admin") ? "admin" : "member";
              const registered = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                new Date(user.createdAt),
              );
              return (
                <TableRow key={user.id}>
                  <TableCell className="max-w-64 whitespace-normal wrap-anywhere">
                    <span className="font-medium">{user.name}</span>
                    <span className="block text-muted-foreground">{user.email}</span>
                    <span className="mt-1 block text-xs text-muted-foreground @3xl/main:hidden">
                      {t(user.emailVerified ? "verified" : "unverified")}
                      <span className="block">{registered}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden @3xl/main:table-cell">
                    <Badge variant="secondary">
                      {t(user.emailVerified ? "verified" : "unverified")}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal wrap-anywhere">
                    {roles.length ? roles.map((value) => t(value)).join(", ") : t("unknown")}
                  </TableCell>
                  <TableCell className="hidden @3xl/main:table-cell">{registered}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <IconButton
                        label={t("editRole")}
                        disabled={!canChange || user.id === accountId}
                        onClick={() => {
                          setSelection({ id: user.id, email: user.email, role: currentRole });
                          setRole(currentRole);
                          setSaved(false);
                          setError(null);
                        }}
                      >
                        <ShieldCheckIcon aria-hidden="true" />
                      </IconButton>
                      {user.id === accountId && (
                        <HelpHint label={t("selfRole")} description={t("selfRoleHint")} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <nav
        aria-label={t("pagination")}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p className="text-sm text-muted-foreground">
          {t("page", {
            page: String(Math.floor(offset / pageSize) + 1),
            total: String(users.data?.total ?? 0),
          })}
        </p>
        <div className="flex gap-2">
          <IconButton
            label={t("previous")}
            disabled={offset === 0 || users.isFetching}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </IconButton>
          <IconButton
            label={t("next")}
            disabled={users.isFetching || offset + pageSize >= (users.data?.total ?? 0)}
            onClick={() => setOffset(offset + pageSize)}
          >
            <ArrowRightIcon aria-hidden="true" />
          </IconButton>
        </div>
      </nav>
      <Dialog
        open={selection !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setSelection(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("editRole")}</DialogTitle>
            <DialogDescription className="wrap-anywhere">
              {t("confirm", { email: selection?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="user-role">{t("role")}</FieldLabel>
            <SelectField
              id="user-role"
              value={role}
              disabled={busy || saved}
              onValueChange={setRole}
              options={[
                { value: "member", label: t("member") },
                { value: "admin", label: t("admin") },
              ]}
            />
          </Field>
          {error && (
            <p role="alert" className="text-destructive-text">
              {t(error)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setSelection(null)}>
              {c("cancel")}
            </Button>
            <Button
              disabled={busy || !canChange || (!saved && role === selection?.role)}
              onClick={() => void saveRole()}
            >
              {c(busy ? "working" : saved ? "retry" : "save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
