import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { LockIcon } from "@raypx/icons/lock";
import { MonitorIcon } from "@raypx/icons/monitor";
import { SettingsIcon } from "@raypx/icons/settings";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { CloseIcon } from "@raypx/icons/close";
import { SearchIcon } from "@raypx/icons/search";
import { Dialog, DialogContent, DialogTitle } from "@raypx/ui/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { IconButton } from "@raypx/ui/icon-button";
import { Button } from "@raypx/ui/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { EmptyState } from "@raypx/ui/empty-state";
import { Badge } from "@raypx/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { AppearanceSettings, LanguageSettings } from "@raypx/blocks/settings";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import type { SettingsSection } from "./navigation.ts";

const VisitedSections = createContext<ReadonlySet<string>>(new Set(["account"]));

/** Mount private reads on first visit; retain the panel afterwards to preserve edits. */
export function AccountSettingsContent({
  value,
  className,
  children,
}: {
  value: SettingsSection;
  className?: string;
  children: ReactNode;
}) {
  const visited = useContext(VisitedSections);
  return visited.has(value) ? (
    <TabsContent value={value} keepMounted className={className}>
      {children}
    </TabsContent>
  ) : null;
}

/** The URL owns selection; visited panels retain edits until the dialog closes. */
export function AccountSettingsPanel({
  section,
  onSectionChange,
  onClose,
  children,
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const i = useTranslations("instances");
  const s = useTranslations("settings");
  const a = useTranslations("analytics");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([section]));
  if (!visited.has(section)) setVisited(new Set([...visited, section]));
  const scrollRef = useRef<HTMLDivElement>(null);
  const sections = (
    [
      { value: "account", label: t("accountTitle"), icon: UserCircleIcon },
      { value: "preferences", label: s("device"), icon: SettingsIcon },
      { value: "diagnostics", label: a("title"), icon: ShieldCheckIcon },
      { value: "password", label: t("changePassword"), icon: LockIcon },
      { value: "sessions", label: t("sessions.title"), icon: ShieldCheckIcon },
      { value: "instances", label: i("instances"), icon: MonitorIcon },
    ] as const
  ).map((item) => ({ ...item, keywords: s(`searchKeywords.${item.value}`) }));
  const searchTerms = query.normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = searchTerms.length > 0;
  const results = sections.filter((item) => {
    const text = `${item.label} ${item.keywords}`.normalize("NFKC").toLowerCase();
    return searchTerms.every((term) => text.includes(term));
  });
  function focusResult(event: KeyboardEvent<HTMLElement>) {
    if (!searching || event.nativeEvent.isComposing) return;
    const buttons = Array.from(
      resultsRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = (current + 1) % buttons.length;
        break;
      case "ArrowUp":
        next = current > 0 ? current - 1 : buttons.length - 1;
        break;
      case "Home":
        if (current < 0) return;
        next = 0;
        break;
      case "End":
        if (current < 0) return;
        next = buttons.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    buttons[next]?.focus();
  }
  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }
  function selectResult(value: string) {
    changeSection(value);
    clearSearch();
  }
  function changeSection(value: unknown) {
    const next = sections.find((item) => item.value === value);
    if (!next) return;
    onSectionChange(next.value);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }
  const currentSection = sections.find((item) => item.value === section)!;
  const SectionIcon = currentSection.icon;
  const deviceSection = section === "preferences" || section === "diagnostics";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="h-[min(52rem,90dvh)] max-h-[90dvh] w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl"
        onKeyDownCapture={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "k" &&
            !event.altKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            searchRef.current?.focus();
            searchRef.current?.select();
          }
          if (event.key === "Escape" && query && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            clearSearch();
          }
        }}
      >
        <Tabs
          value={section}
          onValueChange={changeSection}
          orientation="vertical"
          className="min-h-0 flex-col gap-0 md:flex-row"
        >
          <aside className="flex shrink-0 flex-col gap-4 border-b border-border bg-muted/30 p-4 md:w-56 md:border-r md:border-b-0 md:py-6">
            <DialogTitle className="flex items-center gap-2 px-2 pr-10">
              <SettingsIcon aria-hidden="true" className="size-5 text-muted-foreground" />
              {c("settings")}
            </DialogTitle>
            <InputGroup>
              <InputGroupInput
                ref={searchRef}
                role="searchbox"
                aria-label={s("search")}
                placeholder={s("search")}
                autoComplete="off"
                aria-keyshortcuts="Control+k Meta+k"
                value={query}
                maxLength={200}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter" && searching && results[0]) {
                    event.preventDefault();
                    selectResult(results[0].value);
                  } else focusResult(event);
                }}
              />
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              {query && (
                <InputGroupAddon align="inline-end">
                  <IconButton label={s("clearSearch")} size="icon-xs" onClick={clearSearch}>
                    <CloseIcon aria-hidden="true" />
                  </IconButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            {searching && (
              <nav
                ref={resultsRef}
                aria-label={s("searchResults")}
                className="min-h-0 overflow-y-auto max-md:max-h-40"
              >
                <p role="status" className="sr-only">
                  {s("searchResultCount", { count: results.length })}
                </p>
                {results.length ? (
                  <ul className="flex flex-col gap-1">
                    {results.map(({ value, label, icon: Icon }) => (
                      <li key={value}>
                        <Button
                          variant="ghost"
                          className="min-h-10 w-full justify-start"
                          onKeyDown={focusResult}
                          onClick={() => selectResult(value)}
                        >
                          <Icon aria-hidden="true" data-icon="inline-start" />
                          <span className="truncate">{label}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title={s("noSearchResults")} className="px-1 py-4" />
                )}
              </nav>
            )}
            <div hidden={searching}>
              <TabsList
                aria-label={c("account")}
                className="w-full items-stretch justify-start gap-1 bg-transparent p-0 max-md:hidden"
              >
                {sections.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="min-h-10 shrink-0 gap-2 px-3 py-2 md:flex-none"
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="md:hidden">
                <Select items={sections} value={section} onValueChange={changeSection}>
                  <SelectTrigger aria-label={c("settings")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {sections.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </aside>
          <div
            ref={scrollRef}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-5 pr-14 backdrop-blur-sm md:px-8 md:pr-14">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <SectionIcon aria-hidden="true" className="size-5" />
                </span>
                <h1 className="text-base font-semibold">{currentSection.label}</h1>
              </div>
              <Badge variant="outline">
                {deviceSection ? (
                  <MonitorIcon aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <UserCircleIcon aria-hidden="true" data-icon="inline-start" />
                )}
                {deviceSection ? c("device") : s("accountScope")}
              </Badge>
            </header>
            <div className="p-5 md:p-8">
              <VisitedSections value={visited}>
                {children}
                <AccountSettingsContent value="preferences">
                  <div className="@container/settings rounded-xl border border-border bg-background p-5">
                    <AppearanceSettings />
                    <LanguageSettings />
                    <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <MonitorIcon aria-hidden="true" className="size-4 shrink-0" />
                      {s("localHint")}
                    </p>
                  </div>
                </AccountSettingsContent>
                <AccountSettingsContent value="diagnostics">
                  <div className="rounded-xl border border-border bg-background px-5">
                    <AnalyticsSettings />
                  </div>
                </AccountSettingsContent>
              </VisitedSections>
            </div>
          </div>
        </Tabs>
        <div className="absolute top-3 right-3 z-20">
          <IconButton label={c("close")} variant="ghost" onClick={onClose}>
            <CloseIcon aria-hidden="true" />
          </IconButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
