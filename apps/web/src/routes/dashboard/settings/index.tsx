import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import { IconBrain, IconSettings, IconShield, IconUserCheck } from "@tabler/icons-react";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { PageWrapper } from "~/components/page-wrapper";
import { AccountSettings } from "./-components/account-settings";
import { PreferencesSettings } from "./-components/preferences-settings";
import { RAGSettings } from "./-components/rag-settings";
import { SecuritySettings } from "./-components/security-settings";

export const Route = createFileRoute("/dashboard/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const getTabFromSearch = (): "account" | "security" | "preferences" | "rag" => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "security" || tab === "preferences" || tab === "account" || tab === "rag")
      return tab;
    return "account";
  };

  const activeTab = getTabFromSearch();

  const sidebarNavItems = [
    {
      title: "Account",
      icon: IconUserCheck,
      value: "account",
      description: "Profile and personal information",
    },
    {
      title: "Security",
      icon: IconShield,
      value: "security",
      description: "Password and authentication",
    },
    {
      title: "Preferences",
      icon: IconSettings,
      value: "preferences",
      description: "App settings and customization",
    },
    {
      title: "RAG",
      icon: IconBrain,
      value: "rag",
      description: "Document vectorization configuration",
    },
  ];

  return (
    <PageWrapper className="pb-16 block" spacing="md">
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="-mx-4 lg:w-1/5">
          <SidebarProvider className="items-start">
            <Sidebar className="hidden lg:flex bg-transparent border-r-0" collapsible="none">
              <SidebarContent>
                <SidebarGroup className="p-0">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {sidebarNavItems.map((item) => (
                        <SidebarMenuItem key={item.value}>
                          <SidebarMenuButton
                            isActive={activeTab === item.value}
                            onClick={() =>
                              navigate({
                                to: "/dashboard/settings",
                                search: { tab: item.value },
                              })
                            }
                          >
                            <item.icon
                              className={cn(
                                "h-4 w-4",
                                activeTab === item.value ? "text-primary" : "text-muted-foreground",
                              )}
                            />
                            <span
                              className={cn(
                                activeTab === item.value ? "text-primary font-medium" : "",
                              )}
                            >
                              {item.title}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>

            {/* Mobile Navigation */}
            <nav className="flex space-x-2 lg:hidden px-4 overflow-x-auto">
              {sidebarNavItems.map((item) => (
                <button
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                    activeTab === item.value
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                  key={item.value}
                  onClick={() =>
                    navigate({
                      to: "/dashboard/settings",
                      search: { tab: item.value },
                    })
                  }
                  type="button"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </button>
              ))}
            </nav>
          </SidebarProvider>
        </aside>
        <div className="flex-1 lg:max-w-4xl">
          {activeTab === "account" && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  Manage your account profile and personal information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AccountSettings />
              </CardContent>
            </Card>
          )}
          {activeTab === "security" && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your account security and authentication</CardDescription>
              </CardHeader>
              <CardContent>
                <SecuritySettings />
              </CardContent>
            </Card>
          )}
          {activeTab === "preferences" && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Customize your application preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <PreferencesSettings />
              </CardContent>
            </Card>
          )}
          {activeTab === "rag" && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle>RAG Configuration</CardTitle>
                <CardDescription>
                  Configure embedding provider and text chunking settings for document vectorization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RAGSettings />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
