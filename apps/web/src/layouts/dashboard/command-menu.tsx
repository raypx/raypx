import { Button } from "@raypx/ui/components/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@raypx/ui/components/command";
import { Icon } from "@raypx/ui/components/icon";
import { Kbd } from "@raypx/ui/components/kbd";
import { useCmdK } from "@raypx/ui/hooks/use-cmd-k";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import { IconDeviceDesktop, IconLogout, IconMoon, IconSearch, IconSun } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authRoutes } from "~/config/auth";
import { sidebarGroups } from "~/config/sidebar";

export function CommandMenu() {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  useCmdK(() => setOpen((open) => !open));

  return (
    <>
      <Button
        className="group relative hidden h-9 w-full max-w-md justify-start border border-border/50 bg-muted/50 text-left font-normal text-sm shadow-xs transition-all hover:border-border hover:bg-accent hover:text-accent-foreground md:flex"
        onClick={() => setOpen(true)}
        variant="ghost"
      >
        <IconSearch className="mr-2 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        <span className="flex-1 text-muted-foreground transition-colors group-hover:text-foreground">
          Search anything...
        </span>
        <Kbd className="ml-2 hidden bg-background text-muted-foreground transition-colors group-hover:text-foreground sm:flex">
          <span className="mr-1 text-xs">⌘</span>K
        </Kbd>
      </Button>

      <Button
        className="text-muted-foreground hover:text-foreground md:hidden"
        onClick={() => setOpen(true)}
        size="icon"
        variant="ghost"
      >
        <IconSearch className="h-4 w-4" />
        <span className="sr-only">Search</span>
      </Button>

      <CommandDialog onOpenChange={setOpen} open={open}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.values(sidebarGroups).map((group) => (
            <CommandGroup heading={group.label} key={group.label}>
              {group.items.map((item) => {
                return (
                  <CommandItem
                    key={item.href}
                    onSelect={() => {
                      navigate({ to: item.href });
                      setOpen(false);
                    }}
                  >
                    <Icon className="mr-2 h-4 w-4" icon={item.icon} />
                    <span>{item.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}

          <CommandSeparator />

          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => setTheme("light")}>
              <IconSun className="mr-2 h-4 w-4" />
              <span>Light</span>
            </CommandItem>
            <CommandItem onSelect={() => setTheme("dark")}>
              <IconMoon className="mr-2 h-4 w-4" />
              <span>Dark</span>
            </CommandItem>
            <CommandItem onSelect={() => setTheme("system")}>
              <IconDeviceDesktop className="mr-2 h-4 w-4" />
              <span>System</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Account">
            <CommandItem
              onSelect={() => {
                window.location.href = authRoutes.signOut;
              }}
            >
              <IconLogout className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
