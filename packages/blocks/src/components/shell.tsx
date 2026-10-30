import {
  Fragment,
  useId,
  useMemo,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type CSSProperties,
} from "react";
import { sidebarPreference } from "./sidebar-preference";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  // Settings, account and onboarding keep a reading width.
  document:
    "max-w-240 px-14 pt-13 pb-20 @max-4xl/main:px-8 @max-4xl/main:pt-9 @max-4xl/main:pb-14 @max-xl/main:px-5",
  // List and detail workspaces.
  workbench: "max-w-400 px-8 pt-6 pb-10 @max-2xl/main:px-5",
  // Local tools use the whole main region.
  tool: "px-8 pt-6 pb-10 @max-2xl/main:px-5",
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
            "--sidebar-width-icon": "var(--app-rail-width, 4rem)",
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
  function renderItem(item: ShellNavItem<To>) {
    return (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton
          tooltip={item.label}
          className="relative min-h-10 gap-3 rounded-lg px-3 text-[13px] text-muted-foreground focus-visible:ring-inset aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground max-[760px]:min-h-11 [&_svg]:size-5 [&_svg]:stroke-[1.75]"
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
    <>
      <a
        href="#main"
        className="fixed top-2 left-2 z-30 -translate-y-[160%] bg-foreground px-4 py-2 text-background focus:translate-y-0"
      >
        {c("skipNavigation")}
      </a>
      <Sidebar
        id={sidebarId}
        role="complementary"
        collapsible="icon"
        className={cn(
          "min-h-0 overflow-hidden border-border bg-sidebar pb-3 px-3 sidebar-icon:px-2 max-[420px]:sidebar-icon:px-1.5",
          windowed ? "pt-11" : "pt-6 max-[760px]:pt-5",
        )}
      >
        <SidebarHeader className="mb-6 shrink-0 p-0">
          <LinkComponent
            to={brand.to}
            markActive={false}
            aria-label={brand.label}
            className="mx-3 w-fit max-w-full min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring sidebar-icon:mx-auto sidebar-icon:[&_[data-slot=logo]>span]:hidden"
          >
            <Logo label={brand.label} className="max-w-full [&>span]:truncate" />
          </LinkComponent>
          {brand.description && (
            <p className="mt-2 truncate px-3 text-xs text-muted-foreground sidebar-icon:hidden">
              {brand.description}
            </p>
          )}
        </SidebarHeader>
        <nav aria-label={brand.label} className="flex min-h-0 flex-1 flex-col">
          <SidebarContent className="gap-5">
            {navigation.map((group, index) => (
              <Fragment key={index}>
                <SidebarGroup role="group" aria-label={navigationLabels?.[index]} className="p-0">
                  {navigationLabels?.[index] && (
                    <SidebarGroupLabel
                      aria-hidden="true"
                      className="mb-2 h-auto px-3 text-muted-foreground"
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
            <SidebarFooter className="mt-3 shrink-0 border-t border-border px-0 pt-3 pb-0">
              <SidebarMenu className="gap-1">{secondaryNavigation.map(renderItem)}</SidebarMenu>
            </SidebarFooter>
          )}
        </nav>
        {account !== undefined && (
          <SidebarFooter className="mt-2 shrink-0 flex-row items-center gap-1 border-t border-border px-0 pt-2 pb-0 sidebar-icon:flex-col">
            <div className="min-w-0 flex-1 sidebar-icon:w-full">{account}</div>
            {accountAction}
          </SidebarFooter>
        )}
      </Sidebar>
      <div className="@container/main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={cn(
            "flex h-[66px] shrink-0 items-center gap-[13px] border-b border-border px-6 text-[13px] text-muted-foreground max-[760px]:h-[58px] max-[760px]:px-5",
            windowed && "[-webkit-app-region:drag]",
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
              {collapsed ? (
                <PanelLeftOpen className="size-[18px]" />
              ) : (
                <PanelLeftClose className="size-[18px]" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
          </Tooltip>
          {breadcrumbs.map((crumb, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <span aria-hidden="true" className="opacity-45">
                  /
                </span>
              )}
              <span
                className={cn(
                  "max-w-48 truncate",
                  index === breadcrumbs.length - 1 && "text-foreground",
                )}
              >
                {crumb}
              </span>
            </Fragment>
          ))}
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
    </>
  );
}
