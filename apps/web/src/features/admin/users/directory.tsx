import { DirectoryActions, DirectoryFeedback } from "./directory-actions";
import { useEffect } from "react";

import { useFormatter, useTranslations } from "../../../i18n/client";

import { adminUsersClient, type AdminUsersClient } from "./client";
import { DirectoryToolbar } from "./directory-toolbar";
import { useDirectoryStore } from "./store-provider";
import { changeUserStatus } from "./operations";
import type { AdminUsersPage, UserListInput, UserRole, UserStatus } from "./types";
import { PageNavigation } from "../../navigation/route-state";
import { UserTable } from "./user-table";
import {
  formatAdminJoinedAt,
  formatAdminLastActive,
  formatAdminRole,
  formatAdminStatus,
} from "./display";

export function UserDirectory({
  page,
  search,
  onSearch,
  reload,
  client = adminUsersClient,
}: {
  page: AdminUsersPage;
  search: UserListInput;
  onSearch: (patch: {
    query?: string | undefined;
    role?: UserRole | undefined;
    status?: UserStatus | undefined;
    cursor?: string | undefined;
  }) => void;
  reload: () => Promise<void>;
  client?: AdminUsersClient;
}) {
  const t = useTranslations("admin");
  const formatter = useFormatter();
  const store = useDirectoryStore();
  useEffect(() => {
    store.getState().resetSelection();
  }, [store, search.query, search.role, search.status, search.cursor]);
  const toggleUser = (user: AdminUsersPage["items"][number]) =>
    changeUserStatus({
      store,
      client,
      users: [user],
      status: user.status === "suspended" ? "active" : "suspended",
      reload,
      single: true,
    });
  function exportVisibleUsers() {
    if (page.items.length === 0) {
      store.getState().setNotice({ code: "noUsersToExport" });
      return;
    }

    const header = [t("user"), t("email"), t("role"), t("status"), t("lastActive"), t("joined")];
    const rows = page.items.map((user) => [
      user.name,
      user.email,
      formatAdminRole(user.role, t),
      formatAdminStatus(user.status, t),
      formatAdminLastActive(user.lastActive, t, formatter),
      formatAdminJoinedAt(user.joinedAt, formatter, t("notAvailable")),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "voidmix-users.csv";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    store.getState().setNotice({ code: "usersExported", values: { count: page.items.length } });
  }

  return (
    <>
      <section className="directory-panel rounded-xl border bg-card min-w-0">
        <DirectoryToolbar
          onExport={exportVisibleUsers}
          query={search.query ?? ""}
          role={search.role}
          setQuery={(query) => onSearch({ query, cursor: undefined })}
          setRole={(role) => onSearch({ role, cursor: undefined })}
          setStatus={(status) => onSearch({ status, cursor: undefined })}
          status={search.status}
        />

        <DirectoryActions users={page.items} client={client} reload={reload} />

        <DirectoryFeedback />
        <UserTable
          isLoading={false}
          onToggle={(user) => void toggleUser(user)}
          users={page.items}
        />
        <footer className="flex min-h-14 items-center justify-between gap-3 border-t px-4 text-xs text-muted-foreground max-[480px]:items-start max-[480px]:py-3">
          <span>{t("showingUsers", { count: page.items.length })}</span>
          <PageNavigation
            cursor={search.cursor}
            nextCursor={page.nextCursor}
            onNavigate={(cursor) => onSearch({ cursor })}
          />
        </footer>
      </section>
    </>
  );
}
