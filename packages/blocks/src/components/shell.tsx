import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { sidebarPreference } from "./sidebar-preference";
import { SidebarCollapseIcon } from "@raypx/icons/sidebar-collapse";
import { SidebarExpandIcon } from "@raypx/icons/sidebar-expand";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";
import { Logo } from "@raypx/ui/logo";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarTrigger,
  useSidebar,
} from "@raypx/ui/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@raypx/ui/components/ui/tooltip";

/** Applications adapt their router link to this shape. */
export interface ShellLinkProps<To extends string> {
  to: To;
  /** Navigation entries set `aria-current="page"` while active; the brand link does not. */
  markActive: boolean;
  exact?: boolean;
  className: string;
  "aria-label"?: string;
  children: ReactNode;
}

export interface ShellNavItem<To extends string> {
  to: To;
  label: string;
  icon: ReactNode;
  /** Active only on this exact path, as the home entry needs. */
  exact?: boolean;
  badge?: ReactNode;
}

/**
 * Page templates own content width, gutters and vertical rhythm. Their breakpoints
 * follow the content column (`@…/main`), whose width changes with the sidebar.
 */
export type PageLayout = "document" | "workbench" | "tool";

/** Metadata an application declares on each route rendered inside the shell. */
export interface ShellPage<Title extends string = string> {
  /** Breadcrumb title as a full message key, such as `common.tasks`. */
  title: Title;
  /** Title for signed-out visitors, when the page serves them as something else. */
  guestTitle?: Title;
  layout: PageLayout;
}

const pageLayouts: Record<PageLayout, string> = {
  // Settings and account stay in a reading column so labels sit with their controls.
  document: "max-w-3xl px-8 pt-10 pb-16 @max-xl/main:px-5 @max-xl/main:pt-8 @max-xl/main:pb-12",
  // List and detail workspaces.
  workbench: "max-w-400 px-6 pt-5 pb-8 @max-2xl/main:px-5",
  // Local tools use the whole main region.
  tool: "px-6 pt-5 pb-8 @max-2xl/main:px-5",
};

export interface AppShellProps<To extends string> {
  storageKey?: string;
  /** Both frames fill the viewport; `window` also reserves the native title-bar inset. */
  frame?: "document" | "window";
  brand: { to: To; label: string; description?: string };
  /** Main navigation groups, with optional captions supplied by navigationLabels. */
  navigation: readonly (readonly ShellNavItem<To>[])[];
  navigationLabels?: readonly string[];
  /** Application-owned context, between primary navigation and auxiliary tools. */
  contextNavigation?: ReactNode;
  /** Account and preferences stay above the account menu, separate from task navigation. */
  secondaryNavigation?: readonly ShellNavItem<To>[];
  account?: ReactNode;
  accountAction?: ReactNode;
  breadcrumbs: readonly string[];
  /** Template for the current page, including its loading and error states. */
  layout: PageLayout;
  /** Shown between the top bar and main content, such as a service alert. */
  notice?: ReactNode;
  LinkComponent: ComponentType<ShellLinkProps<To>>;
  children: ReactNode;
}

interface ToolbarSlots {
  start: HTMLElement | null;
  end: HTMLElement | null;
  claim: () => () => void;
}
const ToolbarContext = createContext<ToolbarSlots | null>(null);

/**
 * Renders page chrome in the top bar: `start` replaces the page title with the page's
 * own context and navigation, `end` holds page-level actions and scope switches.
 * Content mounts after hydration because portals need the client-side slot; outside
 * an AppShell it renders inline.
 */
export function ShellToolbar({
  side = "start",
  children,
}: {
  side?: "start" | "end";
  children: ReactNode;
}) {
  const slots = useContext(ToolbarContext);
  const claim = slots?.claim;
  useEffect(() => (side === "start" && claim ? claim() : undefined), [claim, side]);
  // Outside the shell (isolated views and tests) the content stays inline.
  if (!slots) return <>{children}</>;
  const target = slots[side];
  return target ? createPortal(children, target) : null;
}

/** Page-level actions and scope switches at the end of the top bar. */
export function ShellActions({ children }: { children: ReactNode }) {
  return <ShellToolbar side="end">{children}</ShellToolbar>;
}

export function AppShell<To extends string>(props: AppShellProps<To>) {
  const preference = useMemo(() => sidebarPreference(props.storageKey), [props.storageKey]);
  const open = useSyncExternalStore(preference.subscribe, preference.snapshot, () => true);
  return (
    <TooltipProvider delay={300}>
      <SidebarProvider
        open={open}
        onOpenChange={preference.set}
        mobileBehavior="rail"
        style={
          {
            "--sidebar-width": "var(--app-sidebar-width, 15rem)",
            "--sidebar-width-icon":
              props.frame === "window"
                ? "max(var(--app-rail-width, 4rem), var(--mygo-titlebar-inset-left, 0px))"
                : "var(--app-rail-width, 4rem)",
          } as CSSProperties
        }
        className={cn(
          "h-dvh min-h-0 overflow-hidden max-[420px]:[--app-rail-width:3.625rem]",
          props.frame === "window" && "max-[1100px]:[--app-sidebar-width:11.875rem]",
        )}
      >
        <ShellContents {...props} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function ShellContents<To extends string>({
  frame = "document",
  brand,
  navigation,
  navigationLabels,
  contextNavigation,
  secondaryNavigation,
  account,
  accountAction,
  breadcrumbs,
  layout,
  notice,
  LinkComponent,
  children,
}: AppShellProps<To>) {
  const c = useTranslations("common");
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const sidebarId = useId();
  const toggleLabel = c(collapsed ? "expandSidebar" : "collapseSidebar");
  const windowed = frame === "window";
  const [toolbarStart, setToolbarStart] = useState<HTMLElement | null>(null);
  const [toolbarEnd, setToolbarEnd] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const toolbar = useMemo<ToolbarSlots>(
    () => ({
      start: toolbarStart,
      end: toolbarEnd,
      claim: () => {
        setClaims((value) => value + 1);
        return () => setClaims((value) => value - 1);
      },
    }),
    [toolbarStart, toolbarEnd],
  );
  function renderItem(item: ShellNavItem<To>) {
    return (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton
          tooltip={item.label}
          className="relative min-h-control-lg gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent/80 hover:text-foreground focus-visible:ring-inset aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-sm max-[760px]:min-h-control-xl [&_svg]:size-5 [&_svg]:stroke-[1.75]"
          render={
            <LinkComponent
              to={item.to}
              markActive
              {...(item.exact ? { exact: true } : {})}
              className=""
            >
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
                {item.icon}
              </span>
              <span className="min-w-0 truncate sidebar-icon:sr-only">{item.label}</span>
              {item.badge !== undefined && (
                <SidebarMenuBadge className="static ml-auto h-auto p-0 empty:hidden [&>span]:rounded-full [&>span]:text-[10px] sidebar-icon:absolute sidebar-icon:top-0.5 sidebar-icon:right-0 sidebar-icon:flex sidebar-icon:[&>span]:bg-foreground sidebar-icon:[&>span]:text-background">
                  {item.badge}
                </SidebarMenuBadge>
              )}
            </LinkComponent>
          }
        />
      </SidebarMenuItem>
    );
  }
  return (
    <ToolbarContext.Provider value={toolbar}>
      <a
        href="#main"
        className={cn(
          "fixed left-2 z-30 -translate-y-[160%] bg-foreground px-4 py-2 text-background focus:translate-y-0",
          windowed ? "top-[max(0.5rem,var(--mygo-titlebar-height,0px))]" : "top-2",
        )}
      >
        {c("skipNavigation")}
      </a>
      <Sidebar
        id={sidebarId}
        role="complementary"
        collapsible="icon"
        className={cn(
          "min-h-0 overflow-hidden border-border bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95 px-2 pb-2 shadow-sm sidebar-icon:px-1.5 max-[420px]:sidebar-icon:px-1",
          !windowed && "pt-2",
        )}
      >
        {windowed && (
          <div
            aria-hidden="true"
            className="h-[max(2.5rem,var(--mygo-titlebar-height,0px))] shrink-0 [--app-region:drag]"
          />
        )}
        <SidebarHeader className="mb-4 shrink-0 gap-0 p-0">
          <LinkComponent
            to={brand.to}
            markActive={false}
            aria-label={brand.label}
            className="mx-2.5 flex min-h-9 w-fit max-w-full min-w-0 items-center rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring sidebar-icon:mx-auto sidebar-icon:[&_[data-slot=logo]>span]:hidden"
          >
            <Logo label={brand.label} className="max-w-full [&>span]:truncate" />
          </LinkComponent>
          {brand.description && (
            <p className="mt-1 truncate px-2.5 text-xs text-muted-foreground opacity-70 sidebar-icon:hidden">
              {brand.description}
            </p>
          )}
        </SidebarHeader>
        <nav aria-label={brand.label} className="flex min-h-0 flex-1 flex-col">
          <SidebarContent className="gap-5">
            {navigation.map((group, index) => (
              <Fragment key={index}>
                <SidebarGroup role="group" aria-label={navigationLabels?.[index]} className="p-0">
                  {navigation.length > 1 && navigationLabels?.[index] && (
                    <SidebarGroupLabel
                      aria-hidden="true"
                      className="mb-1.5 h-auto px-2.5 text-xs font-medium text-muted-foreground opacity-60"
                    >
                      {navigationLabels[index]}
                    </SidebarGroupLabel>
                  )}
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-1">{group.map(renderItem)}</SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                {index === 0 && contextNavigation}
              </Fragment>
            ))}
          </SidebarContent>
          {secondaryNavigation && secondaryNavigation.length > 0 && (
            <SidebarFooter className="mt-auto shrink-0 border-t border-border px-0 pt-2 pb-0">
              <SidebarMenu className="gap-1">{secondaryNavigation.map(renderItem)}</SidebarMenu>
            </SidebarFooter>
          )}
        </nav>
        {account !== undefined && (
          <SidebarFooter className="mt-1 shrink-0 flex-row items-center gap-1 border-t border-border px-0 pt-2 pb-0 sidebar-icon:flex-col">
            <div className="min-w-0 flex-1 sidebar-icon:w-full">{account}</div>
            {accountAction}
          </SidebarFooter>
        )}
      </Sidebar>
      <div className="@container/main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 text-sm text-muted-foreground max-[760px]:px-3",
            windowed &&
              "pr-[max(1rem,calc(var(--mygo-titlebar-inset-right,0px)+0.5rem))] [--app-region:drag]",
          )}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarTrigger
                  size="icon"
                  aria-label={toggleLabel}
                  aria-controls={sidebarId}
                  aria-expanded={!collapsed}
                  className="mr-1 text-muted-foreground max-[760px]:hidden"
                />
              }
            >
              {collapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
            </TooltipTrigger>
            <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
          </Tooltip>
          {claims === 0 &&
            breadcrumbs.map((crumb, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <span aria-hidden="true" className="opacity-45">
                    /
                  </span>
                )}
                <span
                  className={cn(
                    "max-w-48 truncate",
                    index === breadcrumbs.length - 1 && "font-medium text-foreground",
                  )}
                >
                  {crumb}
                </span>
              </Fragment>
            ))}
          <div
            ref={setToolbarStart}
            className="flex h-full min-w-0 items-center gap-3 empty:hidden [--app-region:no-drag]"
          />
          <div
            ref={setToolbarEnd}
            className="ml-auto flex shrink-0 items-center gap-2 empty:hidden [--app-region:no-drag]"
          />
        </header>
        {notice}
        <main
          id="main"
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain outline-none"
        >
          <div data-layout={layout} className={cn("mx-auto w-full min-w-0", pageLayouts[layout])}>
            {children}
          </div>
        </main>
      </div>
    </ToolbarContext.Provider>
  );
}
