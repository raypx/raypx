import {
  BuildingIcon,
  CreditCardIcon,
  GearIcon,
  HouseIcon,
  SignOutIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Separator } from "@raypx/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@raypx/ui/components/sidebar";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { signOut, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: HouseIcon },
  { title: "Settings", href: "/dashboard/settings", icon: GearIcon },
];

const settingsItems = [
  { title: "Profile", href: "/dashboard/settings/profile", icon: UserIcon },
  { title: "Organization", href: "/dashboard/settings/organization", icon: BuildingIcon },
  { title: "Billing", href: "/dashboard/settings/billing", icon: CreditCardIcon },
];

function DashboardLayout() {
  const { data: session } = useSession();
  const user = session?.user;

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b p-4">
          <Link className="flex items-center gap-2 font-semibold text-lg" to="/">
            <span className="bg-linear-to-r from-rose-400 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
              Raypx
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton>
                      <Link to={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton>
                      <Link to={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={user?.image || undefined} />
              <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 truncate">
              <p className="truncate font-medium text-sm">{user?.name}</p>
              <p className="truncate text-muted-foreground text-xs">{user?.email}</p>
            </div>
            <button
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={handleSignOut}
              type="button"
            >
              <SignOutIcon className="size-4" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b px-6">
          <SidebarTrigger />
          <Separator className="h-6" orientation="vertical" />
          <h1 className="font-semibold">Dashboard</h1>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
