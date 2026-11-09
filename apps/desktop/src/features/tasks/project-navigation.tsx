import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { FolderIcon } from "@raypx/icons/folder";
import { PlusIcon } from "@raypx/icons/plus";
import { SearchIcon } from "@raypx/icons/search";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@raypx/ui/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useDesktopPlatform } from "../../lib/platform-context.tsx";
import { useProjectCatalog } from "./project-catalog.ts";
import { recentProjects, rememberProject } from "./project-history.ts";

/** Local project shortcuts never depend on a browser account or remote task data. */
export function ProjectNavigation() {
  const t = useTranslations("tasks");
  const platform = useDesktopPlatform();
  const location = useLocation();
  const search = new URLSearchParams(location.searchStr);
  const selected = !["remote", "account", "cloud"].includes(search.get("scope") ?? "local")
    ? (search.get("project") ?? search.get("rootId"))
    : null;
  const recent = recentProjects();
  const [query, setQuery] = useState("");
  const [allOpen, setAllOpen] = useState(false);
  const { data, isError, isPending } = useProjectCatalog();
  if (!platform.isDesktop()) return null;
  const projects = [...(data?.[0]?.projects ?? [])].sort((a, b) => {
    const rank = (id: string) => {
      const index = recent.indexOf(id);
      return index < 0 ? recent.length : index;
    };
    return rank(a.id) - rank(b.id);
  });
  function remember(id: string) {
    rememberProject(id);
  }
  function items(values: typeof projects) {
    return (
      <SidebarMenu className="gap-1">
        {values.map((project) => (
          <SidebarMenuItem key={project.id}>
            <SidebarMenuButton
              tooltip={project.name}
              className="min-h-control-lg gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground [&_svg]:size-5"
              render={
                <Link
                  to="/tasks"
                  search={{
                    scope: "local",
                    project: project.id,
                    ...(data?.[0] ? { device: data[0].id } : {}),
                  }}
                  aria-current={selected === project.id ? "page" : undefined}
                  onClick={() => remember(project.id)}
                />
              }
            >
              <FolderIcon aria-hidden="true" className="shrink-0 stroke-[1.75]" />
              <span className="truncate">{project.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }
  const matches = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const showAll = allOpen && projects.length > 5;
  return (
    <SidebarGroup className="p-0 sidebar-icon:hidden" aria-label={t("recentProjects")}>
      <div className="mb-2 flex items-center justify-between pl-3">
        <SidebarGroupLabel className="h-auto p-0">{t("recentProjects")}</SidebarGroupLabel>
        <Button
          size="icon-sm"
          variant="ghost"
          nativeButton={false}
          aria-label={t("authorize")}
          render={<Link to="/welcome" />}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      <SidebarGroupContent>
        {isPending ? (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            {t("loadingProjects")}
          </p>
        ) : isError && !data ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t("projectsUnavailable")}</p>
        ) : !projects.length ? (
          <Link
            to="/welcome"
            className="block rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            {t("addFirstProject")}
          </Link>
        ) : (
          !showAll && items(projects.slice(0, 5))
        )}
        {projects.length > 5 && (
          <Collapsible open={allOpen} onOpenChange={setAllOpen}>
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="group mt-1 w-full justify-start px-3 text-muted-foreground"
                />
              }
            >
              <ChevronDownIcon aria-hidden="true" className="group-data-panel-open:rotate-180" />
              {t("allProjects")}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
              <InputGroup controlSize="sm" className="mx-1 w-auto">
                <InputGroupAddon>
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label={t("searchProjects")}
                  placeholder={t("searchProjects")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={200}
                />
              </InputGroup>
              <div className="max-h-60 overflow-y-auto">{items(matches)}</div>
              {!matches.length && (
                <p className="px-3 text-xs text-muted-foreground">{t("noProjectsMatch")}</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
