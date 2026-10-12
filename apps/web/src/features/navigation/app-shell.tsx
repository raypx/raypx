import {
  ArrowsClockwise,
  FolderSimple,
  List,
  UsersThree,
  ChatCircle,
  ListChecks,
  ChartBar,
  Bell,
} from "@phosphor-icons/react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { IconButton } from "@voidmix/ui/icon-button";
import { Avatar } from "@voidmix/ui/avatar";
import { Logo } from "@voidmix/ui/logo";
import { Modal } from "@voidmix/ui/modal";
import { signOut, useSession } from "../../lib/auth-client";
import { useTranslations } from "../../i18n/client";
import { AccountMenu } from "./account-menu";

export function AppShell() {
  const t = useTranslations("navigation");
  const adminRuns = useTranslations("adminRuns");
  const session = useSession();
  const navigate = useNavigate();
  const router = useRouter();
  async function logout() {
    await signOut();
    const accountId = session.data?.user.id;
    if (accountId) router.options.context.resources.disposeAccount(accountId);
    await router.options.context.queryClient.cancelQueries();
    router.options.context.queryClient.clear();
    router.clearCache({ filter: (match) => match.routeId.startsWith("/(app)") });
    await navigate({ to: "/" });
  }
  const pathname = useLocation({ select: (location) => location.pathname });
  const refreshing = useRouterState({ select: (state) => state.isLoading });
  const [open, setOpen] = useState(false);
  const role = (session.data?.user as { role?: string } | undefined)?.role;
  const name = session.data?.user.name ?? t("user");
  const admin = role === "admin" || role === "owner";
  const items = [
    { to: "/chat", label: t("chat"), icon: ChatCircle },
    { to: "/tasks", label: t("tasks"), icon: ListChecks },
    { to: "/notifications", label: t("notifications"), icon: Bell },
    { to: "/settings/usage", label: t("usage"), icon: ChartBar },
    { to: "/projects", label: t("projects"), icon: FolderSimple },
    ...(admin
      ? ([
          { to: "/admin", label: t("users"), icon: UsersThree },
          { to: "/admin-runs", label: adminRuns("title"), icon: ListChecks },
        ] as const)
      : []),
  ] as const;
  const navigation = (
    <nav aria-label={t("navigation")} className="workbench-nav flex flex-col gap-1.5">
      {items.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-foreground [@media(max-width:767px)]:min-h-11"
          to={to}
          aria-label={label}
          title={label}
          onClick={() => setOpen(false)}
          activeProps={{ "aria-current": "page" }}
        >
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="workbench-shell grid grid-cols-[232px_minmax(0,_1fr)] min-h-svh [@media(max-width:1023px)]:grid-cols-[72px_minmax(0,_1fr)] [@media(max-width:767px)]:block">
      <a
        className="skip-link fixed top-2 left-2 z-60 [transform:translateY(-200%)] py-2 px-4 bg-popover rounded-[8px] [&:focus]:[transform:translateY(0)]"
        href="#main-content"
      >
        {t("skipContent")}
      </a>
      <aside className="workbench-sidebar sticky top-0 h-svh flex flex-col gap-8 pt-7 pb-4 px-4 border-r border-border bg-sidebar [@media(max-width:1023px)]:px-3 [@media(max-width:1023px)]:[&_.workbench-nav_span]:hidden [@media(max-width:767px)]:hidden">
        <Link
          to="/chat"
          className="workbench-brand flex py-0 px-3 [&_img]:size-7 [@media(max-width:1023px)]:[&_[data-slot=logo]_>_span]:hidden [@media(max-width:1023px)]:p-0 [@media(max-width:1023px)]:justify-center"
          aria-label={t("projects")}
        >
          <Logo />
        </Link>
        {navigation}
        <div className="workbench-account mt-auto flex items-center gap-2 border-t border-border pt-4 [@media(max-width:1023px)]:justify-center [@media(max-width:1023px)]:[&>div:first-child]:hidden">
          <Avatar name={name} size="small" />
          <span className="min-w-0 flex-1 truncate [@media(max-width:1023px)]:hidden">{name}</span>
          <AccountMenu name={name} role={role} onSignOut={logout} />
        </div>
      </aside>
      <div className="workbench-frame min-w-0">
        <header className="workbench-topbar flex items-center gap-3 h-14 py-0 px-8 border-b border-border bg-card [@media(max-width:767px)]:py-0 [@media(max-width:767px)]:px-4">
          <div className="workbench-mobile-menu hidden [@media(max-width:767px)]:block">
            <Modal
              title={t("navigation")}
              closeLabel={t("close")}
              open={open}
              onOpenChange={setOpen}
              drawer
              trigger={
                <IconButton label={t("openNavigation")}>
                  <List aria-hidden="true" />
                </IconButton>
              }
            >
              {navigation}
              <AccountMenu name={name} role={role} onSignOut={logout} />
            </Modal>
          </div>
          <span>
            {pathname.startsWith("/admin-runs")
              ? adminRuns("title")
              : pathname.startsWith("/admin")
                ? t("users")
                : pathname.startsWith("/chat")
                  ? t("chat")
                  : pathname.startsWith("/tasks")
                    ? t("tasks")
                    : pathname.startsWith("/notifications")
                      ? t("notifications")
                      : pathname.startsWith("/settings")
                        ? t("usage")
                        : t("projects")}
          </span>
          {refreshing ? (
            <span role="status" title={t("refreshing")} className="ml-auto text-muted-foreground">
              <ArrowsClockwise
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span className="sr-only">{t("refreshing")}</span>
            </span>
          ) : null}
        </header>
        <main
          id="main-content"
          className="workbench-content max-w-350 my-0 mx-auto p-8 [@media(max-width:767px)]:py-6 [@media(max-width:767px)]:px-4"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
