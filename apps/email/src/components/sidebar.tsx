import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/collapsible";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as UISidebar,
} from "@raypx/ui/components/sidebar";
import { Link } from "@tanstack/react-router";
import { ChevronDown, FileText, Folder, MailIcon } from "lucide-react";
import type { EmailMenuItem } from "../lib/emails";

interface SidebarProps {
  menuTree: EmailMenuItem[];
  selectedTemplateName: string;
}

// Group templates by category (first segment of path)
function groupTemplates(menuTree: EmailMenuItem[]): Record<string, EmailMenuItem[]> {
  const groups: Record<string, EmailMenuItem[]> = {};

  function traverse(items: EmailMenuItem[]) {
    for (const item of items) {
      if (item.templateName) {
        // Leaf node - add to group
        const segments = item.path.split("/").filter(Boolean);
        const firstSegment = segments[0];
        const category = segments.length > 1 && firstSegment ? firstSegment : "General";
        const group = groups[category];
        if (group) {
          group.push(item);
        } else {
          groups[category] = [item];
        }
      }
      if (item.children) {
        traverse(item.children);
      }
    }
  }

  traverse(menuTree);
  return groups;
}

export function Sidebar({ menuTree, selectedTemplateName }: SidebarProps) {
  const groups = groupTemplates(menuTree);

  return (
    <UISidebar className="w-64 border-r border-sidebar-border">
      <SidebarHeader className="flex h-14 flex-row items-center justify-start border-b border-sidebar-border px-0 py-0">
        <div className="flex w-full items-center gap-2 px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-foreground">
            <MailIcon className="h-4 w-4 text-background" />
          </div>
          <span className="font-semibold text-foreground">Email Preview</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {Object.entries(groups).map(([category, templates]) => (
          <SidebarGroup key={category}>
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild nativeButton={false}>
                <SidebarGroupLabel className="cursor-pointer hover:text-sidebar-foreground">
                  <Folder className="h-4 w-4" />
                  <span className="ml-2">{category}</span>
                  <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=closed]/collapsible:-rotate-90" />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {templates.map((template) => {
                      const isSelected = selectedTemplateName === template.templateName;
                      return (
                        <SidebarMenuItem key={template.path}>
                          <SidebarMenuButton asChild isActive={isSelected}>
                            <Link params={{ _splat: template.templateName }} to="/email/$">
                              <FileText className="h-4 w-4" />
                              <span
                                className={
                                  isSelected
                                    ? "text-sidebar-foreground font-bold"
                                    : "text-sidebar-foreground/50"
                                }
                              >
                                {template.label}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </UISidebar>
  );
}
