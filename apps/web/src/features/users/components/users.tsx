import { useTranslations } from "../../../i18n.js";
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { assignedRoles, type AuthRole } from "@raypx/auth/access";
import { hasPermission } from "@raypx/account/access";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { PageHeader } from "@raypx/ui/page-header";
import { RefreshIcon } from "@raypx/icons/refresh";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
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
import { UserTable, type UserRoleSelection } from "./user-table.js";
import { UserFilters, type UserFiltersValue } from "./user-filters.js";
import { RolePermissions } from "./role-permissions.js";

const pageSize = 20;
export function Users({ accountId }: { accountId: string }) {
  const c = useTranslations("common");
  const t = useTranslations("users");
  const cache = useQueryClient();
  const [filters, setFilters] = useState<UserFiltersValue>({
    search: null,
    verification: "all",
    sortDirection: "desc",
  });
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<
    (UserRoleSelection & { mode: "view" | "edit" }) | null
  >(null);
  const [role, setRole] = useState<AuthRole | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const fence = useRef(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"forbidden" | "failed" | "refreshFailed" | null>(null);
  const openRole = useCallback(
    (selected: UserRoleSelection, mode: "view" | "edit", trigger: HTMLElement) => {
      returnFocus.current = trigger;
      setSelection({ ...selected, mode });
      setRole(null);
      setSaved(false);
      setError(null);
    },
    [],
  );
  const currentRoles = assignedRoles(selection?.role);
  const currentRole = currentRoles.includes("admin") ? "admin" : (currentRoles[0] ?? null);
  const nextRole = role ?? currentRole;
  const editing = selection?.mode === "edit";
  const access = useQuery(accountAccessQuery(accountId));
  const permissions =
    !access.isError && access.data?.accountId === accountId ? access.data : undefined;
  const canView = hasPermission(permissions, "users.read");
  const canChange = canView && hasPermission(permissions, "users.roles.update");
  const listKey = ["admin-users", apiUrl, accountId] as const;
  const { search, verification, sortDirection } = filters;
  const users = useQuery({
    queryKey: [...listKey, filters, offset],
    queryFn: async ({ signal }) => {
      const result = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset,
          sortBy: "createdAt",
          sortDirection,
          ...(search
            ? {
                searchValue: search.value,
                searchField: search.field,
                searchOperator: "contains" as const,
              }
            : {}),
          ...(verification !== "all"
            ? {
                filterField: "emailVerified",
                filterOperator: "eq" as const,
                filterValue: verification === "verified",
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
  const total = users.data?.total ?? 0;
  const loaded = users.data?.users.length ?? 0;
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: listKey }, { throwOnError: true }),
      cache.invalidateQueries({ queryKey: ["account-access"] }, { throwOnError: true }),
    ]);
  };
  async function saveRole() {
    if (
      !selection ||
      !editing ||
      selection.id === accountId ||
      !canChange ||
      !nextRole ||
      (!saved && nextRole === currentRole) ||
      fence.current
    )
      return;
    fence.current = true;
    setBusy(true);
    setError(null);
    let changed = saved;
    try {
      if (!changed) {
        const result = await authClient.admin.setRole({
          userId: selection.id,
          role: nextRole,
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
      <div className="min-w-0 rounded-xl border border-border">
        <UserFilters
          filters={filters}
          onChange={(value) => {
            setFilters(value);
            setOffset(0);
          }}
        />
        <div aria-busy={users.isFetching} className="min-w-0">
          {users.isError ? (
            <div className="flex flex-col items-start gap-3 p-4">
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
          ) : loaded === 0 ? (
            <EmptyState title={t(search || verification !== "all" ? "empty" : "noUsers")} />
          ) : (
            <UserTable
              rows={users.data.users}
              accountId={accountId}
              canView={canView}
              canChange={canChange}
              sortDirection={sortDirection}
              onOpenRole={openRole}
            />
          )}
        </div>
        <nav
          aria-label={t("pagination")}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 @xl/main:px-4"
        >
          <p aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
            {users.isSuccess &&
              loaded > 0 &&
              t("results", { from: offset + 1, to: offset + loaded, total })}
          </p>
          <div className="flex gap-2">
            <IconButton
              label={c("previousPage")}
              disabled={offset === 0 || users.isFetching}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              <ArrowLeftIcon aria-hidden="true" />
            </IconButton>
            <IconButton
              label={c("nextPage")}
              disabled={users.isFetching || offset + pageSize >= total}
              onClick={() => setOffset(offset + pageSize)}
            >
              <ArrowRightIcon aria-hidden="true" />
            </IconButton>
          </div>
        </nav>
      </div>
      <Dialog
        open={selection !== null && canView}
        onOpenChange={(open) => {
          if (!open && !busy) setSelection(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          finalFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : false)}
        >
          <DialogHeader>
            <DialogTitle>{t(editing ? "editRole" : "viewPermissions")}</DialogTitle>
            <DialogDescription className="wrap-anywhere">
              {t(editing ? "confirm" : "permissionsFor", { email: selection?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <Field>
              <FieldLabel htmlFor="user-role">{t("role")}</FieldLabel>
              <SelectField
                id="user-role"
                value={nextRole}
                placeholder={t("chooseRole")}
                disabled={busy || saved || !canChange}
                onValueChange={setRole}
                options={[
                  { value: "member", label: t("member") },
                  { value: "admin", label: t("admin") },
                ]}
              />
            </Field>
          )}
          <RolePermissions roles={currentRoles} proposedRole={editing ? nextRole : undefined} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setSelection(null)}>
              {c(editing ? "cancel" : "close")}
            </Button>
            {editing && (
              <Button
                disabled={busy || !canChange || (!saved && nextRole === currentRole)}
                onClick={() => void saveRole()}
              >
                {c(busy ? "working" : saved ? "retry" : "save")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
