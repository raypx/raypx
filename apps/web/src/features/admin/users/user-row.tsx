import { useDirectoryStore, useDirectorySelector } from "./store-provider";
import { Checkbox } from "@voidmix/ui/components/ui/checkbox";
import { TableCell, TableRow } from "@voidmix/ui/components/ui/table";
import { Avatar } from "@voidmix/ui/avatar";
import { Badge } from "@voidmix/ui/components/ui/badge";
import { Button } from "@voidmix/ui/components/ui/button";
import type { AdminUser, UserStatus } from "./types";
import { useFormatter, useTranslations } from "../../../i18n/client";
import {
  formatAdminJoinedAt,
  formatAdminLastActive,
  formatAdminRole,
  formatAdminStatus,
} from "./display";

export function UserRow({ user, onToggle }: { user: AdminUser; onToggle: () => void }) {
  const store = useDirectoryStore();
  const selected = useDirectorySelector((state) => state.selectedIds.has(user.id));
  const isPending = useDirectorySelector((state) => state.pendingIds.has(user.id));
  const tone = statusTone(user.status);
  const t = useTranslations("admin");
  const formatter = useFormatter();
  const actionLabel = user.status === "suspended" ? t("activate") : t("suspend");
  const isOwner = user.role === "owner";
  return (
    <TableRow
      className="data-[selected]:bg-secondary [@media(max-width:767px)]:grid [@media(max-width:767px)]:grid-cols-[44px_minmax(0,1fr)_auto] [@media(max-width:767px)]:items-center [@media(max-width:767px)]:border-b [@media(max-width:767px)]:border-border [@media(max-width:767px)]:px-2 [@media(max-width:767px)]:py-3"
      data-selected={selected || undefined}
      data-state={selected ? "selected" : undefined}
    >
      <TableCell className="w-12 px-4 py-4 [@media(max-width:767px)]:col-start-1 [@media(max-width:767px)]:row-span-3 [@media(max-width:767px)]:row-start-1 [@media(max-width:767px)]:border-0 [@media(max-width:767px)]:p-0">
        <label className="directory-checkbox inline-flex cursor-pointer items-center justify-center [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(max-width:767px)]:min-h-11 [@media(max-width:767px)]:min-w-11">
          <Checkbox
            aria-label={`${t("selectUser")} ${user.name}`}
            checked={selected}
            onCheckedChange={(checked) => store.getState().select(user.id, checked)}
          />
        </label>
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground tabular-nums [@media(max-width:767px)]:border-0 [@media(max-width:767px)]:px-2 [@media(max-width:767px)]:py-1 [@media(max-width:767px)]:col-span-2 [@media(max-width:767px)]:col-start-2">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="flex min-w-0 flex-col gap-0.5 [overflow-wrap:anywhere]">
            <strong className="text-sm text-foreground">{user.name}</strong>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground tabular-nums [@media(max-width:767px)]:border-0 [@media(max-width:767px)]:px-2 [@media(max-width:767px)]:py-1 [@media(max-width:767px)]:col-start-2 [@media(max-width:767px)]:text-[12px]">
        <span>{formatAdminRole(user.role, t)}</span>
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground tabular-nums [@media(max-width:767px)]:border-0 [@media(max-width:767px)]:px-2 [@media(max-width:767px)]:py-1 [@media(max-width:767px)]:col-start-2">
        <Badge variant={tone}>{formatAdminStatus(user.status, t)}</Badge>
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground tabular-nums [@media(max-width:767px)]:border-0 [@media(max-width:767px)]:px-2 [@media(max-width:767px)]:py-1 [@media(max-width:767px)]:hidden">
        {formatAdminLastActive(user.lastActive, t, formatter)}
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground tabular-nums [@media(max-width:767px)]:border-0 [@media(max-width:767px)]:px-2 [@media(max-width:767px)]:py-1 [@media(max-width:767px)]:hidden">
        {formatAdminJoinedAt(user.joinedAt, formatter, t("notAvailable"))}
      </TableCell>
      <TableCell className="px-4 py-4 text-muted-foreground tabular-nums [@media(max-width:767px)]:border-0 [@media(max-width:767px)]:px-2 [@media(max-width:767px)]:py-1 [@media(max-width:767px)]:col-start-3 [@media(max-width:767px)]:row-span-2 [@media(max-width:767px)]:row-start-2">
        <Button
          aria-label={`${actionLabel} ${user.name}`}
          disabled={isOwner || isPending}
          onClick={onToggle}
          title={isOwner ? t("ownerCannotSuspend") : undefined}
          size="sm"
          variant="ghost"
        >
          {isPending ? t("saving") : actionLabel}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function statusTone(status: UserStatus): "secondary" | "outline" {
  return status === "active" ? "secondary" : "outline";
}
