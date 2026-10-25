import { Fragment, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";
import { Logo } from "@raypx/ui/logo";

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

export interface AppShellProps<To extends string> {
  /** Both frames fill the viewport; `window` also reserves the native title-bar inset. */
  frame?: "document" | "window";
  brand: { to: To; label: string };
  /** Groups are separated by a rule. */
  navigation: readonly (readonly ShellNavItem<To>[])[];
  account?: ReactNode;
  breadcrumbs: readonly string[];
  /** Shown between the top bar and main content, such as a service alert. */
  notice?: ReactNode;
  LinkComponent: ComponentType<ShellLinkProps<To>>;
  children: ReactNode;
}

const navigationItemClassName =
  "flex min-h-10 items-center gap-[11px] rounded-[7px] px-3 text-muted-foreground transition-[background-color,color] duration-150 motion-reduce:transition-none hover:bg-muted hover:text-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-[550] aria-[current=page]:text-foreground aria-[current=page]:hover:bg-sidebar-accent max-[760px]:justify-center max-[760px]:px-0 max-[760px]:[&_svg]:size-[21px]";

export function AppShell<To extends string>({
  frame = "document",
  brand,
  navigation,
  account,
  breadcrumbs,
  notice,
  LinkComponent,
  children,
}: AppShellProps<To>) {
  const c = useTranslations("common");
  const windowed = frame === "window";
  return (
    <div className="flex h-dvh min-h-0 overflow-hidden">
      <a
        href="#main"
        className="fixed top-2 left-2 z-30 -translate-y-[160%] bg-foreground px-4 py-2 text-background focus:translate-y-0"
      >
        {c("skipNavigation")}
      </a>
      <aside
        className={cn(
          "flex min-h-0 w-56 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-sidebar px-4 pb-5 max-[760px]:w-18 max-[760px]:px-2.5 max-[420px]:w-[58px] max-[420px]:px-1.5",
          // Native windows reserve the title-bar inset; browsers use ordinary top spacing.
          windowed ? "pt-11 max-[1100px]:w-[190px]" : "pt-7 max-[760px]:py-5",
        )}
      >
        <LinkComponent
          to={brand.to}
          markActive={false}
          aria-label={brand.label}
          className="mx-3 mb-[38px] w-fit max-w-full min-w-0 max-[760px]:mx-auto max-[760px]:mb-8 max-[760px]:[&_[data-slot=logo]>span]:hidden"
        >
          <Logo label={brand.label} className="max-w-full [&>span]:truncate" />
        </LinkComponent>
        <nav aria-label={brand.label} className="flex flex-col gap-1.25">
          {navigation.map((group, index) => (
            <Fragment key={index}>
              {index > 0 && <span aria-hidden="true" className="mx-2.5 my-[18px] h-px bg-border" />}
              {group.map((item) => (
                <LinkComponent
                  key={item.to}
                  to={item.to}
                  markActive
                  {...(item.exact ? { exact: true } : {})}
                  className={navigationItemClassName}
                >
                  {item.icon}
                  <span className="min-w-0 truncate max-[760px]:sr-only">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-auto max-[760px]:hidden">{item.badge}</span>
                  )}
                </LinkComponent>
              ))}
            </Fragment>
          ))}
        </nav>
        {account !== undefined && <div className="mt-auto pt-7">{account}</div>}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={cn(
            "flex h-[66px] shrink-0 items-center gap-[13px] border-b border-border px-10 text-[13px] text-muted-foreground max-[760px]:h-[58px] max-[760px]:px-6",
            windowed && "[-webkit-app-region:drag]",
          )}
        >
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
          {children}
        </main>
      </div>
    </div>
  );
}
