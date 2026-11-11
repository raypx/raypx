import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import type { AuthRole } from "@raypx/auth/access";
import { hasPermission } from "@raypx/account/access";
import { Button } from "@raypx/ui/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { PageHeader } from "@raypx/ui/page-header";
import { SearchIcon } from "@raypx/icons/search";
import { RefreshIcon } from "@raypx/icons/refresh";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { SelectField } from "@raypx/ui/select-field";
import { IconButton } from "@raypx/ui/icon-button";
import { LoadingState } from "@raypx/ui/loading-state";
import { EmptyState } from "@raypx/ui/empty-state";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { accountAccessQuery } from "../../auth/access.js";
import { authClient, apiUrl } from "../../auth/client.js";
import { UserTable, type UserRoleSelection, type UserSortDirection } from "./user-table.js";

const pageSize = 20;
type SearchField = "email" | "name";

export function Users({ accountId }: { accountId: string }) {
  const c = useTranslations("common");
  const t = useTranslations("users");
  const cache = useQueryClient();
  const [field, setField] = useState<SearchField>("email");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState({ field: "email" as SearchField, value: "" });
  const [offset, setOffset] = useState(0);
  const [sortDirection, setSortDirection] = useState<UserSortDirection>("desc");
  const [selection, setSelection] = useState<UserRoleSelection | null>(null);
  const [role, setRole] = useState<AuthRole>("member");
  const [busy, setBusy] = useState(false);
  const fence = useRef(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"forbidden" | "failed" | "refreshFailed" | null>(null);
  const editRole = useCallback((selected: UserRoleSelection) => {
    setSelection(selected);
    setRole(selected.role);
    setSaved(false);
    setError(null);
  }, []);
  const access = useQuery(accountAccessQuery(accountId));
  const canChange =
    !access.isError &&
    access.data?.accountId === accountId &&
    hasPermission(access.data, "users.roles.update");
  const listKey = ["admin-users", apiUrl, accountId] as const;
  const users = useQuery({
    queryKey: [...listKey, search, offset, sortDirection],
    queryFn: async ({ signal }) => {
      const result = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset,
          sortBy: "createdAt",
          sortDirection,
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
      <PageHeader
        title={c("users")}
        action={
          <IconButton
            label={c("refresh")}
            disabled={users.isFetching}
            onClick={() => void users.refetch()}
          >
            <RefreshIcon aria-hidden="true" />
          </IconButton>
        }
      />
      <form
        className="rounded-xl border border-border bg-sidebar p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setSearch({ field, value: draft.trim() });
        }}
      >
        <FieldGroup className="grid gap-3 @xl/main:grid-cols-[8rem_minmax(0,1fr)_9rem_auto] @xl/main:items-end">
          <Field className="min-w-0">
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
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                id="user-search"
                value={draft}
                maxLength={320}
                onChange={(event) => setDraft(event.target.value)}
              />
            </InputGroup>
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="user-sort">{t("created")}</FieldLabel>
            <SelectField
              id="user-sort"
              value={sortDirection}
              onValueChange={(direction) => {
                setSortDirection(direction);
                setOffset(0);
              }}
              options={[
                { value: "desc", label: t("newestFirst") },
                { value: "asc", label: t("oldestFirst") },
              ]}
            />
          </Field>
          <Button type="submit">{t("search")}</Button>
        </FieldGroup>
        {search.value && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 wrap-anywhere">
              {search.field === "email" ? t("email") : c("name")}: {search.value}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setDraft("");
                setOffset(0);
                setSearch({ field, value: "" });
              }}
            >
              {t("clearSearch")}
            </Button>
          </div>
        )}
      </form>
      <div aria-busy={users.isFetching} className="min-w-0">
        {users.isError ? (
          <div className="flex flex-col items-start gap-3">
            <Alert variant="destructive">
              <AlertDescription>
                {users.error.message === "FORBIDDEN" ? t("forbidden") : c("networkError")}
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={() => void users.refetch()}>
              {c("retry")}
            </Button>
          </div>
        ) : users.isPending ? (
          <LoadingState label={c("loading")} />
        ) : users.data.users.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <UserTable
            rows={users.data.users}
            accountId={accountId}
            canChange={canChange}
            sortDirection={sortDirection}
            onEdit={editRole}
          />
        )}
      </div>
      <nav
        aria-label={t("pagination")}
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
      >
        <p aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
          {users.data &&
            t("page", {
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
            <Alert variant="destructive">
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
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
