import { type ReactNode, useState } from "react";
import { ChevronsUpDownIcon } from "@raypx/icons/chevrons-up-down";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { LoginIcon } from "@raypx/icons/login";
import { LogoutIcon } from "@raypx/icons/logout";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";
import type { AccountProfile } from "../index";

export interface AccountMenuProps {
  variant?: "sidebar" | "header";
  children?: ReactNode;
  user: (Pick<AccountProfile, "name" | "email"> & { image?: string | null | undefined }) | null;
  pending: boolean;
  busy: boolean;
  error: boolean;
  onNavigate: (destination: "account" | "login") => void;
  onSignOut: () => Promise<boolean>;
}

export function AccountMenu({
  variant = "sidebar",
  children,
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
  // Guests get a direct sign-in action; the menu only manages an existing account.
  if (!user)
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={c(pending ? "loading" : "signIn")}
              aria-busy={pending || busy}
              disabled={pending || busy}
              onClick={() => onNavigate("login")}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 text-left text-[13px] font-medium text-foreground outline-none transition-colors duration-150 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none sidebar-icon:size-10 sidebar-icon:justify-center sidebar-icon:border-transparent sidebar-icon:bg-transparent sidebar-icon:px-0"
            />
          }
        >
          <LoginIcon aria-hidden="true" className="size-4.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate sidebar-icon:hidden">
            {c(pending ? "loading" : "signIn")}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{c("signIn")}</TooltipContent>
      </Tooltip>
    );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={c("accountMenu")}
        aria-busy={pending || busy}
        disabled={pending || busy}
        className={cn(
          "flex items-center rounded-lg text-left text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent motion-reduce:transition-none",
          variant === "header"
            ? "size-10 justify-center"
            : "min-h-12 w-full gap-2.5 px-2 py-2 sidebar-icon:justify-center sidebar-icon:px-0",
        )}
      >
        <Avatar name={user.name || user.email} {...(user.image ? { imageUrl: user.image } : {})} />
        <span className={variant === "header" ? "hidden" : "min-w-0 flex-1 sidebar-icon:hidden"}>
          <span className="block truncate text-[13px] font-medium">
            {pending ? c("loading") : user.name || user.email}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        {variant === "sidebar" && (
          <ChevronsUpDownIcon
            aria-hidden="true"
            size={15}
            className="shrink-0 text-muted-foreground sidebar-icon:hidden"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "header" ? "bottom" : "top"}
        align={variant === "header" ? "end" : "start"}
        sideOffset={8}
        aria-label={c("accountMenu")}
        className="w-72 max-w-[calc(100vw-1.5rem)] [&_[data-slot=dropdown-menu-item]>svg]:text-muted-foreground [&_[data-slot=dropdown-menu-item]>svg]:stroke-[1.75] motion-reduce:animate-none"
      >
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
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="min-h-10 gap-2.5 px-2.5"
            onClick={() => onNavigate("account")}
          >
            <UserCircleIcon />
            {c("account")}
          </DropdownMenuItem>
          {children}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="min-h-10 gap-2.5 px-2.5"
            disabled={busy}
            closeOnClick={false}
            onClick={() => void signOut()}
          >
            <LogoutIcon />
            {c(busy ? "working" : "signOut")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {error && (
          <p role="alert" className="px-2.5 py-2 text-xs text-destructive">
            {c("networkError")}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
