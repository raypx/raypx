import { useTranslations } from "../i18n.js";
import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { sidebarPreference } from "./sidebar-preference.js";
import { SidebarCollapseIcon } from "@raypx/icons/sidebar-collapse";
import { SidebarExpandIcon } from "@raypx/icons/sidebar-expand";
import { FolderIcon } from "@raypx/icons/folder";

import { cn } from "@raypx/ui/lib/utils";
import { IconButton } from "@raypx/ui/icon-button";
import { buttonVariants } from "@raypx/ui/components/ui/button";
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
  activeRoute?: string | undefined;
  spaceId?: string | undefined;
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

/** An application command, such as creating an Agent or opening search. */
export interface ShellAction {
  label: string;
  icon: ReactNode;
  /** The primary command is visually distinct in either frame. */
  emphasis?: "primary";
  /** A key hint beside the label; the application binds the keys themselves. */
  shortcut?: { label: string; keys: string };
  /** An application link element for navigation; without it the action is a button. */
  render?: ReactElement;
  onSelect?: () => void;
}

/**
 * Page templates own content width, gutters and vertical rhythm. Their breakpoints
 * follow the content column (`@…/main`), whose width changes with the sidebar.
 */
export type PageLayout = "document" | "workbench" | "tool";

/** Metadata an application declares on each route rendered inside the shell. */
export interface ShellPage<Title extends string = string> {
  /** Breadcrumb title as a full message key, such as `agents.title`. */
  title: Title;
  /** Title for signed-out visitors, when the page serves them as something else. */
  guestTitle?: Title;
  layout: PageLayout;
}

const itemClass = cn(
  buttonVariants({ variant: "ghost" }),
  "relative min-h-9 w-full min-w-0 justify-start gap-2 rounded-lg px-2 text-sm font-normal text-sidebar-foreground focus-visible:ring-inset aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-selected-text pointer-coarse:min-h-11 sidebar-icon:justify-center sidebar-icon:px-0 [&>span:first-child>svg]:size-5",
);

const pageLayouts: Record<PageLayout, string> = {
  // Settings and account stay in a reading column so labels sit with their controls.
  document: "max-w-3xl px-8 pt-10 pb-16 @max-xl/main:px-5 @max-xl/main:pt-8 @max-xl/main:pb-12",
  // List and detail workspaces.
  workbench: "max-w-400 px-6 pt-5 pb-8 @max-2xl/main:px-5",
  // Local tools use the whole main region.
  tool: "flex h-full min-h-0 flex-col",
};

export interface WorkspaceSidebarSlots {
  primaryAction?: ReactNode;
  navigation?: ReactNode;
  directory?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  spaceId?: string | undefined;
  activeRoute?: string | undefined;
  open: boolean;
  sheetOpen?: boolean | undefined;
  onSheetOpenChange?: ((open: boolean) => void) | undefined;
  onOpenChange: (open: boolean) => void;
  getScrollTop: () => number;
  onScrollTopChange: (scrollTop: number) => void;
}

export interface AppShellProps<To extends string> {
  sidebar?: WorkspaceSidebarSlots | undefined;
  skipLink?: boolean;
  reserveWorkspaceSidebar?: boolean;

  storageKey?: string;
  /** Both frames fill the viewport; `window` also reserves the native title-bar inset. */
  frame?: "document" | "window";
  brand: { to: To; label: string; description?: string };
  /** Commands in the window title bar or under the brand in a document. */
  actions?: readonly ShellAction[];
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
const SidebarSlotsContext = createContext<{
  actions: HTMLElement | null;
  header: HTMLElement | null;
  primaryAction: HTMLElement | null;
  navigation: HTMLElement | null;
  directory: HTMLElement | null;
  footer: HTMLElement | null;
  collapsed: boolean;
} | null>(null);

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

/** Feature-owned scope control in the sidebar header, with an inline test fallback. */
export function ShellSidebarHeader({ children }: { children: ReactNode }) {
  const slots = useContext(SidebarSlotsContext);
  if (!slots) return <>{children}</>;
  return slots.header ? createPortal(children, slots.header) : null;
}

/** Feature actions beside the brand/search controls, shared by both frames. */
export function ShellSidebarActions({ children }: { children: ReactNode }) {
  const slots = useContext(SidebarSlotsContext);
  if (!slots) return <>{children}</>;
  return slots.actions ? createPortal(children, slots.actions) : null;
}

/** The current feature's primary action, below its scope control in either frame. */
export function ShellPrimaryAction({ children }: { children: ReactNode }) {
  const slots = useContext(SidebarSlotsContext);
  if (!slots) return <>{children}</>;
  return slots.primaryAction ? createPortal(children, slots.primaryAction) : null;
}

export function useShellSidebarCollapsed() {
  return useContext(SidebarSlotsContext)?.collapsed ?? false;
}

/** Feature navigation before application destinations. */
export function ShellSidebarNavigation({ children }: { children: ReactNode }) {
  const slots = useContext(SidebarSlotsContext);
  if (!slots) return <>{children}</>;
  return slots.navigation ? createPortal(children, slots.navigation) : null;
}

/** The feature directory is the sole conversation directory in the shell. */
export function ShellSidebarDirectory({ children }: { children: ReactNode }) {
  const slots = useContext(SidebarSlotsContext);
  if (!slots) return <>{children}</>;
  return slots.directory ? createPortal(children, slots.directory) : null;
}

/** Space role and member invitation controls beneath the pinned account row. */
export function ShellSidebarFooter({ children }: { children: ReactNode }) {
  const slots = useContext(SidebarSlotsContext);
  if (!slots) return <>{children}</>;
  return slots.footer ? createPortal(children, slots.footer) : null;
}

/** Shared project context with navigation supplied by the application. */
export function ShellProjectToolbar({
  name,
  computer,
  back,
  children,
}: {
  name: string;
  computer?: string | undefined;
  back?: ReactNode;
  children?: ReactNode;
}) {
  const c = useTranslations("common");
  return (
    <ShellToolbar>
      <div className="flex h-full min-w-0 items-center gap-2 in-data-[frame=document]:max-[540px]:has-[[data-project-links]]:contents">
        {back}
        <div className="flex min-w-0 max-w-[35%] shrink-0 items-center gap-2 @min-xl/project-tools:max-w-40 in-data-[frame=document]:max-[540px]:col-start-1 in-data-[frame=document]:max-[540px]:row-start-1 in-data-[frame=document]:max-[540px]:max-w-full">
          <FolderIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground @max-sm/project-tools:hidden"
          />
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{name}</span>
            {computer && (
              <span className="hidden truncate text-xs @min-xl/project-tools:block">
                {computer}
              </span>
            )}
          </div>
        </div>
        {children && (
          <nav
            data-project-links=""
            aria-label={c("projectTools")}
            className="flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-lg bg-muted p-0.5 [scrollbar-width:thin] *:flex *:h-control-sm *:shrink-0 *:items-center *:rounded-md *:px-2 *:text-xs *:font-medium *:whitespace-nowrap *:outline-none *:transition-colors *:hover:text-foreground *:focus-visible:focus-control *:focus-visible:ring-inset *:aria-[current=page]:bg-tab-selected *:aria-[current=page]:text-selected-text *:motion-reduce:transition-none pointer-coarse:p-0 pointer-coarse:[scrollbar-width:none] pointer-coarse:*:min-h-control-xl in-data-[frame=document]:max-[540px]:col-span-full in-data-[frame=document]:max-[540px]:row-start-2 in-data-[frame=document]:max-[540px]:justify-self-start"
          >
            {children}
          </nav>
        )}
      </div>
    </ShellToolbar>
  );
}

export function AppShell<To extends string>(props: AppShellProps<To>) {
  const controlled = props.sidebar !== undefined;
  const preference = useMemo(
    () => (controlled ? null : sidebarPreference(props.storageKey)),
    [controlled, props.storageKey],
  );
  const open = useSyncExternalStore(
    preference?.subscribe ?? subscribeNothing,
    preference?.snapshot ?? expandedSidebar,
    expandedSidebar,
  );
  const onOpenChange = props.sidebar?.onOpenChange ?? preference?.set;
  return (
    <TooltipProvider delay={300}>
      <SidebarProvider
        open={props.sidebar?.open ?? open}
        {...(onOpenChange ? { onOpenChange } : {})}
        openMobile={props.sidebar?.sheetOpen}
        onOpenMobileChange={props.sidebar?.onSheetOpenChange}
        mobileBehavior="rail"
        style={
          {
            "--sidebar-width": "var(--app-sidebar-width, 13.75rem)",
            "--sidebar-width-icon": "var(--app-rail-width, 4rem)",
          } as CSSProperties
        }
        className={cn(
          "h-dvh min-h-0 overflow-hidden max-[420px]:[--app-rail-width:3.625rem]",
          props.frame === "window" && "flex-col",
        )}
      >
        <ShellContents {...props} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function ShellContents<To extends string>({
  frame = "document",
  sidebar,
  reserveWorkspaceSidebar,
  skipLink = true,
  brand,
  actions,
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
  const scrollNode = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (sidebar && scrollNode.current) scrollNode.current.scrollTop = sidebar.getScrollTop();
  }, [sidebar]);
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const sidebarId = useId();
  const toggleLabel = c(collapsed ? "expandSidebar" : "collapseSidebar");
  const windowed = frame === "window";
  const [toolbarStart, setToolbarStart] = useState<HTMLElement | null>(null);
  const [toolbarEnd, setToolbarEnd] = useState<HTMLElement | null>(null);
  const [sidebarActions, setSidebarActions] = useState<HTMLElement | null>(null);
  const [sidebarHeader, setSidebarHeader] = useState<HTMLElement | null>(null);
  const [primaryAction, setPrimaryAction] = useState<HTMLElement | null>(null);
  const [sidebarNavigation, setSidebarNavigation] = useState<HTMLElement | null>(null);
  const [sidebarDirectory, setSidebarDirectory] = useState<HTMLElement | null>(null);
  const [sidebarFooter, setSidebarFooter] = useState<HTMLElement | null>(null);
  const sidebarSlots = useMemo(
    () => ({
      actions: sidebarActions,
      header: sidebarHeader,
      primaryAction,
      navigation: sidebarNavigation,
      directory: sidebarDirectory,
      footer: sidebarFooter,
      collapsed,
    }),
    [
      sidebarActions,
      sidebarHeader,
      primaryAction,
      sidebarNavigation,
      sidebarDirectory,
      sidebarFooter,
      collapsed,
    ],
  );
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
          className={itemClass}
          render={
            <LinkComponent
              to={item.to}
              markActive
              spaceId={sidebar?.spaceId}
              activeRoute={sidebar?.activeRoute}
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
  const sidebarToggle = (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarTrigger
            size={windowed ? "icon-sm" : "icon"}
            aria-label={toggleLabel}
            aria-controls={sidebarId}
            aria-expanded={!collapsed}
            className={cn("max-[760px]:hidden", !windowed && "mr-1")}
          />
        }
      >
        {collapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
      </TooltipTrigger>
      <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
    </Tooltip>
  );
  const brandLink = (
    <LinkComponent
      to={brand.to}
      markActive={false}
      spaceId={sidebar?.spaceId}
      aria-label={brand.label}
      className="mx-1 flex min-h-9 w-fit max-w-full min-w-0 shrink-0 items-center rounded-md pointer-coarse:min-h-11 pointer-coarse:min-w-11 outline-none transition-opacity hover:opacity-80 focus-visible:focus-control [&_[data-slot=logo]>span]:hidden"
    >
      <Logo label={brand.label} className="max-w-full [&>span]:truncate" />
    </LinkComponent>
  );
  const commands = actions?.map((action) => (
    <IconButton
      key={action.label}
      size="icon-sm"
      label={action.label}
      hint={action.shortcut ? `${action.label} (${action.shortcut.label})` : action.label}
      {...(action.shortcut ? { "aria-keyshortcuts": action.shortcut.keys } : {})}
      {...(action.render
        ? { render: action.render, nativeButton: false, role: "link" }
        : { onClick: action.onSelect })}
    >
      {action.icon}
    </IconButton>
  ));
  const header = (
    <header
      data-frame={frame}
      className={cn(
        "@container/project-tools flex shrink-0 items-center gap-2 bg-background text-sm text-muted-foreground",
        windowed
          ? "min-h-[max(3rem,var(--mygo-titlebar-height,0px))] h-auto pr-[max(0.75rem,calc(var(--mygo-titlebar-inset-right,0px)+0.5rem))] pl-[max(0.75rem,calc(var(--mygo-titlebar-inset-left,0px)+0.5rem))] [--app-region:drag]"
          : "min-h-13 h-auto px-4 max-[760px]:px-3 max-[540px]:has-[[data-project-links]]:grid max-[540px]:has-[[data-project-links]]:h-auto max-[540px]:has-[[data-project-links]]:grid-cols-[minmax(0,1fr)_auto] max-[540px]:has-[[data-project-links]]:gap-y-1 max-[540px]:has-[[data-project-links]]:py-1.5",
      )}
    >
      {windowed ? (
        <div className="flex shrink-0 items-center gap-1 [--app-region:no-drag]">
          {brandLink}
          <div
            ref={setSidebarActions}
            className={cn(
              "empty:hidden",
              reserveWorkspaceSidebar &&
                "min-h-7 min-w-7 pointer-coarse:min-h-11 pointer-coarse:min-w-11 empty:block",
            )}
          >
            {sidebar?.actions}
          </div>
          {commands}
          {sidebarToggle}
        </div>
      ) : null}
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
                "min-w-0 max-w-48 truncate",
                index === breadcrumbs.length - 1 && "font-medium text-foreground",
              )}
            >
              {crumb}
            </span>
          </Fragment>
        ))}
      <div
        ref={setToolbarStart}
        className={cn(
          "flex h-full min-w-0 items-center gap-3 empty:hidden [--app-region:no-drag] in-data-[frame=document]:max-[540px]:has-[[data-project-links]]:contents",
          claims > 0 && "flex-1",
        )}
      />
      <div
        ref={setToolbarEnd}
        className="col-start-2 row-start-1 ml-auto flex shrink-0 items-center gap-2 empty:hidden [--app-region:no-drag]"
      />
    </header>
  );
  return (
    <ToolbarContext.Provider value={toolbar}>
      <SidebarSlotsContext.Provider value={sidebarSlots}>
        {skipLink && <ShellSkipLink frame={frame} />}
        {windowed && header}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <Sidebar
            id={sidebarId}
            role="complementary"
            collapsible="icon"
            className={cn(
              "min-h-0 overflow-hidden border-border bg-sidebar px-2 pb-2 sidebar-icon:px-1.5 max-[420px]:sidebar-icon:px-1",
              "pt-2",
              windowed && "absolute h-full",
            )}
          >
            <SidebarHeader className="mb-3 shrink-0 gap-0 p-0">
              {!windowed && (
                <div className="flex min-w-0 items-center justify-between gap-1 sidebar-icon:flex-col">
                  {brandLink}
                  <div className="flex shrink-0 items-center gap-0.5 sidebar-icon:flex-col">
                    <div
                      ref={setSidebarActions}
                      className={cn(
                        "empty:hidden",
                        reserveWorkspaceSidebar &&
                          "min-h-7 min-w-7 pointer-coarse:min-h-11 pointer-coarse:min-w-11 empty:block",
                      )}
                    >
                      {sidebar?.actions}
                    </div>
                    {commands}
                    {sidebarToggle}
                  </div>
                </div>
              )}
              {brand.description && (
                <p className="mt-1 truncate px-2.5 text-xs text-muted-foreground sidebar-icon:hidden">
                  {brand.description}
                </p>
              )}
              <div ref={setSidebarHeader} className="mt-2 min-w-0 empty:hidden" />
              <div
                ref={setPrimaryAction}
                className={cn(
                  "min-w-0 empty:hidden",
                  windowed ? "mt-1" : "mt-3",
                  reserveWorkspaceSidebar && "h-9 pointer-coarse:h-11 empty:block",
                )}
              >
                {sidebar?.primaryAction}
              </div>
            </SidebarHeader>
            <nav aria-label={brand.label} className="flex min-h-0 flex-1 flex-col">
              <SidebarContent
                ref={scrollNode}
                onScroll={(event) => sidebar?.onScrollTopChange(event.currentTarget.scrollTop)}
                className="gap-1 [scrollbar-gutter:stable]"
              >
                <div
                  ref={setSidebarNavigation}
                  className={cn(
                    "min-w-0 empty:hidden",
                    reserveWorkspaceSidebar && "h-9 pointer-coarse:h-11 shrink-0 empty:block",
                  )}
                >
                  {sidebar?.navigation}
                </div>
                {navigation.map((group, index) => (
                  <Fragment key={index}>
                    <SidebarGroup
                      role="group"
                      aria-label={navigationLabels?.[index]}
                      className="p-0"
                    >
                      {navigationLabels?.[index] && (
                        <SidebarGroupLabel
                          aria-hidden="true"
                          className="mb-1.5 h-auto px-2.5 text-xs font-medium text-muted-foreground"
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
                <div ref={setSidebarDirectory} className="min-w-0 shrink-0 empty:hidden">
                  {sidebar?.directory}
                </div>
              </SidebarContent>
              {(reserveWorkspaceSidebar ||
                (secondaryNavigation && secondaryNavigation.length > 0)) && (
                <SidebarFooter className="mt-auto h-11 pointer-coarse:h-13 shrink-0 px-0 pt-2 pb-0">
                  <SidebarMenu className="gap-1">
                    {secondaryNavigation?.map(renderItem)}
                  </SidebarMenu>
                </SidebarFooter>
              )}
            </nav>
            {account !== undefined && (
              <SidebarFooter className="mt-2 h-16 shrink-0 sidebar-icon:h-26 flex-row items-center gap-1 border-t border-sidebar-border/60 px-0 pt-2 pb-0 sidebar-icon:flex-col">
                <div className="min-w-0 flex-1 sidebar-icon:w-full">{account}</div>
                {accountAction}
              </SidebarFooter>
            )}
            <div
              ref={setSidebarFooter}
              className={cn(
                "min-w-0 shrink-0 empty:hidden",
                reserveWorkspaceSidebar &&
                  "h-14 pointer-coarse:h-16 sidebar-icon:h-9 pointer-coarse:sidebar-icon:h-11 empty:block",
              )}
            >
              {sidebar?.footer}
            </div>
          </Sidebar>
          <div className="@container/main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {!windowed && header}
            {notice}
            <main
              id="main"
              tabIndex={-1}
              className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain outline-none"
            >
              <div
                data-layout={layout}
                className={cn("mx-auto w-full min-w-0", pageLayouts[layout])}
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </SidebarSlotsContext.Provider>
    </ToolbarContext.Provider>
  );
}

export function ShellSkipLink({ frame = "document" }: { frame?: "document" | "window" }) {
  const c = useTranslations("common");
  const windowed = frame === "window";
  return (
    <a
      href="#main"
      className={cn(
        "fixed top-0 left-2 z-30 -translate-y-full bg-foreground px-4 py-2 text-background focus:translate-y-0",
        windowed ? "focus:top-[max(0.5rem,var(--mygo-titlebar-height,0px))]" : "focus:top-2",
      )}
    >
      {c("skipNavigation")}
    </a>
  );
}

function subscribeNothing() {
  return () => {};
}
function expandedSidebar() {
  return true;
}
