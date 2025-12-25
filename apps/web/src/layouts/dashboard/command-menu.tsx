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
import { Kbd } from "@raypx/ui/components/kbd";
import { useCmdK } from "@raypx/ui/hooks/use-cmd-k";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import {
  IconDeviceLaptop,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
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
        className="relative group max-w-md w-full hidden md:flex h-9 bg-muted/50 border border-border/50 shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-border transition-all text-left font-normal justify-start text-sm"
        onClick={() => setOpen(true)}
        variant="ghost"
      >
        <IconSearch className="mr-2 h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        <span className="flex-1 text-muted-foreground group-hover:text-foreground transition-colors">
          Search anything...
        </span>
        <Kbd className="hidden sm:flex ml-2 bg-background text-muted-foreground group-hover:text-foreground transition-colors">
          <span className="mr-1 text-xs">⌘</span>K
        </Kbd>
      </Button>

      <Button
        className="md:hidden text-muted-foreground hover:text-foreground"
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
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    onSelect={() => {
                      navigate({ to: item.href });
                      setOpen(false);
                    }}
                  >
                    <Icon className="mr-2 h-4 w-4" />
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
              <IconDeviceLaptop className="mr-2 h-4 w-4" />
              <span>System</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Account">
            <CommandItem
              onSelect={() => {
                navigate({ to: "/dashboard/settings" });
                setOpen(false);
              }}
            >
              <IconSettings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
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
