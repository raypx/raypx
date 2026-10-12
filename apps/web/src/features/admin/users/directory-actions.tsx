import { Button } from "@voidmix/ui/components/ui/button";
import { IconButton } from "@voidmix/ui/icon-button";
import { X } from "@phosphor-icons/react";
import { useTranslations } from "../../../i18n/client";
import { useDirectoryStore, useDirectorySelector } from "./store-provider";
import { changeUserStatus } from "./operations";
import type { AdminUser, AdminUsersClient, UserStatus } from "./types";
export function DirectoryActions({
  users,
  client,
  reload,
}: {
  users: readonly AdminUser[];
  client: AdminUsersClient;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("admin");
  const store = useDirectoryStore();
  const selectedIds = useDirectorySelector((state) => state.selectedIds);
  const pending = useDirectorySelector((state) => state.pendingIds.size > 0);
  const selectedUsers = users.filter((user) => selectedIds.has(user.id));
  const actionableUsers = selectedUsers.filter((user) => user.role !== "owner");
  const updateSelected = (status: UserStatus) =>
    changeUserStatus({ store, client, users: selectedUsers, status, reload });
  return selectedIds.size > 0 ? (
    <div className="directory-selection flex min-h-12 flex-wrap items-center gap-2 border-b bg-secondary px-4 py-2 sticky top-0 z-10">
      <span className="mr-auto text-xs font-medium">
        {t("selectedCount", { count: selectedIds.size })}
        {selectedUsers.some((user) => user.role === "owner") ? (
          <span className="ml-2 text-muted-foreground">{t("ownerProtected")}</span>
        ) : null}
      </span>
      <Button
        disabled={pending || actionableUsers.length === 0}
        onClick={() => void updateSelected("suspended")}
        size="sm"
        variant="outline"
      >
        {t("suspendSelected")}
      </Button>
      <Button
        disabled={pending || actionableUsers.length === 0}
        onClick={() => void updateSelected("active")}
        size="sm"
        variant="outline"
      >
        {t("activateSelected")}
      </Button>
      <IconButton label={t("clear")} onClick={() => store.getState().selectAll([])} size="icon-sm">
        <X aria-hidden="true" />
      </IconButton>
    </div>
  ) : null;
}

export function DirectoryFeedback() {
  const t = useTranslations("admin");
  const notice = useDirectorySelector((state) => state.notice);
  if (!notice) return null;
  return (
    <p aria-live="polite" className="m-0 border-t px-4 py-2 text-xs text-muted-foreground">
      {t(notice.code, notice.values)}
      {notice.refreshFailed ? ` ${t("directoryLoadFailed")}` : ""}
    </p>
  );
}
