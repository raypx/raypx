import { useState } from "react";
import { ChevronsUpDown, CircleUserRound, LogIn, LogOut, Settings } from "lucide-react";
import { Avatar } from "@raypx/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";
import { useTranslations } from "@raypx/i18n/browser";
import type { AccountProfile } from "../index";

export interface AccountMenuProps {
  user: (Pick<AccountProfile, "name" | "email"> & { image?: string | null | undefined }) | null;
  pending: boolean;
  busy: boolean;
  error: boolean;
  onNavigate: (destination: "account" | "settings" | "login") => void;
  onSignOut: () => Promise<boolean>;
}

export function AccountMenu({
  user,
  pending,
  busy,
  error,
  onNavigate,
  onSignOut,
}: AccountMenuProps) {
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  async function signOut() {
    if (await onSignOut()) setOpen(false);
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={c("accountMenu")}
        aria-busy={pending || busy}
        disabled={pending || busy}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-foreground outline-none transition-colors duration-150 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-sidebar-accent motion-reduce:transition-none group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0 max-[760px]:justify-center max-[760px]:px-0"
      >
        {user ? (
          <Avatar
            name={user.name || user.email}
            {...(user.image ? { imageUrl: user.image } : {})}
          />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <CircleUserRound size={20} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1 group-data-[collapsible=icon]/sidebar:hidden max-[760px]:hidden">
          <span className="block truncate text-[13px] font-medium">
            {pending ? c("loading") : user?.name || c("signIn")}
          </span>
          {user && (
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          )}
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          size={15}
          className="shrink-0 text-muted-foreground group-data-[collapsible=icon]/sidebar:hidden max-[760px]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        aria-label={c("accountMenu")}
        className="w-72 max-w-[calc(100vw-1.5rem)] [&_[data-slot=dropdown-menu-item]>svg]:text-muted-foreground [&_[data-slot=dropdown-menu-item]>svg]:stroke-[1.75] motion-reduce:animate-none"
      >
        {user && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-3 px-2.5 py-3">
                <span aria-hidden="true" className="shrink-0">
                  <Avatar
                    name={user.name || user.email}
                    {...(user.image ? { imageUrl: user.image } : {})}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {user.name || user.email}
                  </span>
                  <span className="mt-0.5 block truncate font-normal">{user.email}</span>
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="min-h-10 gap-2.5 px-2.5" onClick={() => onNavigate("account")}>
          <CircleUserRound />
          {c("account")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-10 gap-2.5 px-2.5"
          onClick={() => onNavigate("settings")}
        >
          <Settings />
          {c("settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem
            className="min-h-10 gap-2.5 px-2.5"
            disabled={busy}
            closeOnClick={false}
            onClick={() => void signOut()}
          >
            <LogOut />
            {c(busy ? "working" : "signOut")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="min-h-10 gap-2.5 px-2.5" onClick={() => onNavigate("login")}>
            <LogIn />
            {c("signIn")}
          </DropdownMenuItem>
        )}
        {error && (
          <p role="alert" className="px-2.5 py-2 text-xs text-destructive">
            {c("networkError")}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
