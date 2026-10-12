import { CaretDown, DownloadSimple, FunnelSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { ToggleGroup, ToggleGroupItem } from "@voidmix/ui/components/ui/toggle-group";
import { Button } from "@voidmix/ui/components/ui/button";
import { IconButton } from "@voidmix/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@voidmix/ui/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@voidmix/ui/components/ui/input-group";
import type { UserRole, UserStatus } from "./types";
import { useTranslations } from "../../../i18n/client";
import { formatAdminRole } from "./display";

export function DirectoryToolbar({
  query,
  setQuery,
  status,
  setStatus,
  role,
  setRole,
  onExport,
}: {
  query: string;
  setQuery: (query: string) => void;
  status: UserStatus | undefined;
  setStatus: (status: UserStatus | undefined) => void;
  role: UserRole | undefined;
  setRole: (role: UserRole | undefined) => void;
  onExport: () => void;
}) {
  const t = useTranslations("admin");
  return (
    <div className="flex min-h-16 items-center gap-3 border-b px-4 max-[760px]:flex-wrap max-[760px]:items-stretch max-[760px]:py-3">
      <InputGroup className="max-w-sm max-[760px]:max-w-none max-[760px]:basis-full">
        <InputGroupAddon>
          <MagnifyingGlass weight="regular" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={t("searchUsers")}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t("searchNameEmail")}
          type="search"
          value={query}
        />
      </InputGroup>
      <ToggleGroup
        aria-label={t("filterStatus")}
        size="sm"
        spacing={0}
        variant="outline"
        value={[status ?? "all"]}
        onValueChange={(values) => {
          const value = values[0];
          if (value) setStatus(value === "all" ? undefined : (value as UserStatus));
        }}
      >
        <ToggleGroupItem value="all">{t("allStatuses")}</ToggleGroupItem>
        <ToggleGroupItem value="active">{t("active")}</ToggleGroupItem>
        <ToggleGroupItem value="suspended">{t("suspended")}</ToggleGroupItem>
      </ToggleGroup>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("filterRole")}
              className="gap-1.5"
              size="sm"
              variant={role ? "secondary" : "outline"}
            >
              <FunnelSimple aria-hidden="true" data-icon="inline-start" />
              {role ? formatAdminRole(role, t) : t("role")}
              <CaretDown aria-hidden="true" data-icon="inline-end" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-36">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("filterRole")}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            onValueChange={(value) => setRole(value === "all" ? undefined : (value as UserRole))}
            value={role ?? "all"}
          >
            <DropdownMenuRadioItem value="all">{t("allRoles")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="owner">{t("owner")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="admin">{t("admin")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="user">{t("member")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton label={t("exportVisible")} onClick={onExport} size="icon-sm" variant="outline">
        <DownloadSimple aria-hidden="true" weight="regular" />
      </IconButton>
    </div>
  );
}
