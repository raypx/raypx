import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, Folder, Plus, Search } from "lucide-react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
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
import { isDesktop, onLocalEvent } from "../../lib/desktop";
import { localTaskClient } from "./local-client";
import { taskChangeSchema } from "@raypx/contracts/tasks";
import { desktopStorageKey } from "../../lib/storage";

const recentKey = "raypx.recent-projects.v1";
function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(desktopStorageKey(recentKey)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string" && id.length <= 256).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

/** Local project shortcuts never depend on a browser account or remote task data. */
export function ProjectNavigation() {
  const t = useTranslations("tasks");
  const queries = useQueryClient();
  const location = useLocation();
  const search = new URLSearchParams(location.searchStr);
  const selected =
    location.pathname === "/tasks" &&
    search.get("scope") !== "remote" &&
    search.get("history") !== "account"
      ? search.get("project")
      : null;
  const [recent, setRecent] = useState(readRecent);
  const [query, setQuery] = useState("");
  const [allOpen, setAllOpen] = useState(false);
  const { data, isError, isPending } = useQuery({
    queryKey: ["desktop-project-navigation"],
    queryFn: ({ signal }) => localTaskClient.devices.list({}, { signal }),
    enabled: isDesktop(),
    staleTime: 30_000,
    retry: false,
  });
  useEffect(() => {
    const refresh = () =>
      void queries.invalidateQueries({ queryKey: ["desktop-project-navigation"] });
    const stop = onLocalEvent((event) => {
      if (event.event === "engine.status") refresh();
      if (event.event === "agent.changed") {
        const change = taskChangeSchema.safeParse(event.data.change);
        if (!change.success || change.data.type === "devices" || change.data.type === "reset")
          refresh();
      }
    });
    window.addEventListener("raypx:remote-change", refresh);
    return () => {
      stop();
      window.removeEventListener("raypx:remote-change", refresh);
    };
  }, [queries]);
  if (!isDesktop()) return null;
  const projects = [...(data?.[0]?.projects ?? [])].sort((a, b) => {
    const rank = (id: string) => {
      const index = recent.indexOf(id);
      return index < 0 ? recent.length : index;
    };
    return rank(a.id) - rank(b.id);
  });
  function remember(id: string) {
    const next = [id, ...readRecent().filter((value) => value !== id)].slice(0, 20);
    setRecent(next);
    try {
      localStorage.setItem(desktopStorageKey(recentKey), JSON.stringify(next));
    } catch {
      /* In-memory navigation still works. */
    }
  }
  function items(values: typeof projects) {
    return (
      <SidebarMenu className="gap-1">
        {values.map((project) => (
          <SidebarMenuItem key={project.id}>
            <SidebarMenuButton
              tooltip={project.name}
              className="min-h-10 gap-3 rounded-lg px-3 text-[13px] text-muted-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground [&_svg]:size-5"
              render={
                <Link
                  to="/tasks"
                  search={{ scope: "local", project: project.id }}
                  aria-current={selected === project.id ? "page" : undefined}
                  onClick={() => remember(project.id)}
                />
              }
            >
              <Folder aria-hidden="true" className="shrink-0 stroke-[1.75]" />
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
    <SidebarGroup
      className="p-0 group-data-[collapsible=icon]/sidebar:hidden"
      aria-label={t("recentProjects")}
    >
      <div className="mb-2 flex items-center justify-between pl-3">
        <SidebarGroupLabel className="h-auto p-0">{t("recentProjects")}</SidebarGroupLabel>
        <Button
          size="icon-sm"
          variant="ghost"
          nativeButton={false}
          aria-label={t("authorize")}
          render={<Link to="/welcome" />}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <SidebarGroupContent>
        {isPending ? (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            {t("loadingProjects")}
          </p>
        ) : isError ? (
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
              <ChevronDown aria-hidden="true" className="group-data-panel-open:rotate-180" />
              {t("allProjects")}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="relative mx-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
                />
                <Input
                  aria-label={t("searchProjects")}
                  placeholder={t("searchProjects")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-8"
                  maxLength={200}
                />
              </div>
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
