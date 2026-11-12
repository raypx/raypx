import { useTranslations } from "../../../i18n.js";
import { createContext, useContext, useMemo } from "react";
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { assignedRoles, type AuthRole } from "@raypx/auth/access";
import { useLocale } from "@raypx/i18n/browser";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Avatar } from "@raypx/ui/avatar";
import { DataTable } from "@raypx/ui/data-table";
import { HelpHint } from "@raypx/ui/help-hint";
import { IconButton } from "@raypx/ui/icon-button";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import type { authClient } from "../../auth/client.js";

type UserRow = NonNullable<
  Awaited<ReturnType<typeof authClient.admin.listUsers>>["data"]
>["users"][number];
export type UserSortDirection = "asc" | "desc";
export type UserRoleSelection = { id: string; email: string; role: AuthRole };

const features = tableFeatures({ rowSortingFeature });
const column = createColumnHelper<typeof features, UserRow>();
const wideColumn = "hidden @3xl/main:table-cell";
const sortingByDirection = {
  asc: [{ id: "createdAt", desc: false }],
  desc: [{ id: "createdAt", desc: true }],
};

type UserTableContextValue = {
  accountId: string;
  canChange: boolean;
  onEdit: (selection: UserRoleSelection) => void;
  date: Intl.DateTimeFormat;
  common: ReturnType<typeof useTranslations<"common">>;
  users: ReturnType<typeof useTranslations<"users">>;
};
const UserTableContext = createContext<UserTableContextValue | null>(null);

function useUserTableContext() {
  const context = useContext(UserTableContext);
  if (!context) throw new Error("User table context is missing");
  return context;
}

const columns = column.columns([
  column.display({
    id: "name",
    header: function NameHeader() {
      return useUserTableContext().common("name");
    },
    cell: function UserNameCell({ row: { original: user } }) {
      const { date, users: t } = useUserTableContext();
      return (
        <div className="flex items-start gap-3">
          <Avatar
            name={user.name || user.email}
            size="small"
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <span className="font-medium">{user.name}</span>
            <span className="block text-muted-foreground">{user.email}</span>
            <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground @3xl/main:hidden">
              {t(user.emailVerified ? "verified" : "unverified")}
              <time dateTime={user.createdAt}>{date.format(new Date(user.createdAt))} UTC</time>
            </span>
          </div>
        </div>
      );
    },
  }),
  column.accessor("emailVerified", {
    header: function VerificationHeader() {
      return useUserTableContext().users("verification");
    },
    cell: function VerificationCell({ getValue }) {
      const { users: t } = useUserTableContext();
      return <Badge variant="secondary">{t(getValue() ? "verified" : "unverified")}</Badge>;
    },
  }),
  column.display({
    id: "role",
    header: function RoleHeader() {
      return useUserTableContext().users("role");
    },
    cell: function RoleCell({ row }) {
      const { users: t } = useUserTableContext();
      const roles = assignedRoles(row.original.role);
      return (
        <span className="flex flex-wrap gap-1">
          {roles.length
            ? roles.map((value) => (
                <Badge key={value} variant={value === "admin" ? "secondary" : "outline"}>
                  {t(value)}
                </Badge>
              ))
            : t("unknown")}
        </span>
      );
    },
  }),
  column.accessor("createdAt", {
    header: function RegisteredHeader() {
      return useUserTableContext().users("created");
    },
    cell: function RegisteredCell({ getValue }) {
      const { date } = useUserTableContext();
      return (
        <time dateTime={getValue()} className="text-xs tabular-nums">
          {date.format(new Date(getValue()))} UTC
        </time>
      );
    },
  }),
  column.display({
    id: "actions",
    header: function UserActionsHeader() {
      const { common } = useUserTableContext();
      return <span className="sr-only">{common("actions")}</span>;
    },
    cell: function UserActionsCell({ row: { original: user } }) {
      const { accountId, canChange, onEdit, users: t } = useUserTableContext();
      return (
        <div className="flex items-center justify-end gap-2">
          <IconButton
            label={t("editRole")}
            disabled={!canChange || user.id === accountId}
            onClick={() =>
              onEdit({
                id: user.id,
                email: user.email,
                role: assignedRoles(user.role).includes("admin") ? "admin" : "member",
              })
            }
          >
            <ShieldCheckIcon aria-hidden="true" />
          </IconButton>
          {user.id === accountId && (
            <HelpHint label={t("selfRole")} description={t("selfRoleHint")} />
          )}
        </div>
      );
    },
  }),
]);

export function UserTable({
  rows,
  accountId,
  canChange,
  sortDirection,
  onEdit,
}: {
  rows: UserRow[];
  accountId: string;
  canChange: boolean;
  sortDirection: UserSortDirection;
  onEdit: (selection: UserRoleSelection) => void;
}) {
  const c = useTranslations("common");
  const t = useTranslations("users");
  const locale = useLocale();
  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }),
    [locale],
  );
  const context = useMemo(
    () => ({ accountId, canChange, onEdit, date, common: c, users: t }),
    [accountId, canChange, onEdit, date, c, t],
  );
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (user) => user.id,
    manualSorting: true,
    state: { sorting: sortingByDirection[sortDirection] },
  });
  return (
    <UserTableContext value={context}>
      <div className="@max-3xl/main:[&_table]:block @max-3xl/main:[&_tbody]:block @max-3xl/main:[&_tbody>tr]:grid @max-3xl/main:[&_tbody>tr]:grid-cols-[minmax(0,1fr)_auto] @max-3xl/main:[&_thead]:sr-only">
        <DataTable
          label={c("users")}
          table={table}
          columnPresentation={{
            name: {
              cellClassName:
                "col-span-2 min-w-0 whitespace-normal wrap-anywhere @3xl/main:max-w-64",
            },
            emailVerified: { header: { className: wideColumn }, cellClassName: wideColumn },
            role: { cellClassName: "self-center whitespace-normal wrap-anywhere" },
            createdAt: {
              header: {
                className: wideColumn,
                "aria-sort": table.state.sorting[0]?.desc === false ? "ascending" : "descending",
              },
              cellClassName: wideColumn,
            },
            actions: { header: { className: "w-12" } },
          }}
        />
      </div>
    </UserTableContext>
  );
}
