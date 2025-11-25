import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/collapsible";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  Sidebar as UISidebar,
} from "@raypx/ui/components/sidebar";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { EmailMenuItem } from "../lib/emails";

function MenuItem({ item, currentPath }: { item: EmailMenuItem; currentPath: string }) {
  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.path === currentPath;

  if (hasChildren && item.children) {
    return (
      <Collapsible asChild className="group/collapsible" defaultOpen={true}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton isActive={isActive && !hasChildren} tooltip={item.label}>
              <span>{item.label}</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children.map((child) => (
                <SidebarMenuSubItem key={child.path}>
                  <SidebarMenuSubButton asChild isActive={child.path === currentPath}>
                    <Link params={{ _splat: child.templateName }} to="/email/$">
                      <span>{child.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <Link params={{ _splat: item.templateName }} to="/email/$">
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

type SidebarProps = {
  menuTree: EmailMenuItem[];
  currentTemplateName: string;
};

export function Sidebar({ menuTree, currentTemplateName }: SidebarProps) {
  // Find current path from template name
  const findPathByTemplateName = (items: EmailMenuItem[], templateName: string): string => {
    for (const item of items) {
      if (item.templateName === templateName) {
        return item.path;
      }
      if (item.children) {
        const found = findPathByTemplateName(item.children, templateName);
        if (found) return found;
      }
    }
    return "";
  };

  const currentPath = findPathByTemplateName(menuTree, currentTemplateName);

  // Calculate total template count
  const getLeafCount = (items: EmailMenuItem[]): number => {
    return items.reduce((sum, item) => {
      if (item.children && item.children.length > 0) {
        return sum + getLeafCount(item.children);
      }
      return sum + 1;
    }, 0);
  };

  const totalTemplates = menuTree.reduce((count, item) => count + getLeafCount([item]), 0);

  return (
    <UISidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <div className="flex items-center gap-3 w-full">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-xl font-bold">E</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Email Preview</span>
                  <span className="truncate text-xs">{totalTemplates} templates</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Templates</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuTree.map((item) => (
                <MenuItem currentPath={currentPath} item={item} key={item.path} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          <p className="text-sidebar-foreground">⚡ TanStack Start</p>
          <p className="mt-0.5">Development Only</p>
        </div>
      </SidebarFooter>
    </UISidebar>
  );
}
