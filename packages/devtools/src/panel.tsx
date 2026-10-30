import { useEffect, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { messages } from "./messages";
import type { PageDiagnosticsSnapshot } from "./snapshot";

export function DiagnosticsPanel({
  read,
  locale,
  resolvedTheme,
  stylesheetUrl,
}: {
  read: () => PageDiagnosticsSnapshot;
  locale: string;
  resolvedTheme: string;
  stylesheetUrl: string;
}) {
  const t = locale.startsWith("zh") ? messages.zh : messages.en;
  const queries = useQueryClient();
  useRouterState({ select: (state) => state });
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => queries.getQueryCache().subscribe(() => refresh()), [queries]);
  const snapshot = (() => {
    try {
      return read();
    } catch {
      return null;
    }
  })();
  const [copyState, setCopyState] = useState<"idle" | "pending" | "done" | "manual" | "error">(
    "idle",
  );
  const [manual, setManual] = useState("");
  const text = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (copyState === "manual") {
      text.current?.focus();
      text.current?.select();
    }
  }, [copyState, manual]);
  async function copy() {
    let json: string;
    try {
      json = JSON.stringify(read(), null, 2);
    } catch {
      setCopyState("error");
      return;
    }
    setCopyState("pending");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(json);
      if (mounted.current) {
        setManual("");
        setCopyState("done");
      }
    } catch {
      if (mounted.current) {
        setManual(json);
        setCopyState("manual");
      }
    }
  }
  const row = (label: string, value: string) => (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 border-b border-border py-2"
      key={label}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
  return (
    <section
      lang={locale}
      data-raypx-devtools-panel
      className={`${resolvedTheme === "dark" ? "dark" : ""} min-h-full min-w-0 bg-background p-4 font-sans text-sm text-foreground`}
    >
      <link rel="stylesheet" href={stylesheetUrl} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t.title}</h2>
        <Button onClick={() => void copy()} disabled={!snapshot || copyState === "pending"}>
          {copyState === "pending" ? t.copying : t.copy}
        </Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t.privacy}</p>
      <div role="status" aria-live="polite" className="mb-2">
        {copyState === "done" ? t.copied : copyState === "error" ? t.unavailable : null}
      </div>
      {copyState === "manual" && (
        <div className="mb-4 space-y-2">
          <label htmlFor="raypx-diagnostic-json">{t.manual}</label>
          <Textarea
            id="raypx-diagnostic-json"
            aria-label={t.json}
            ref={text}
            value={manual}
            readOnly
            rows={10}
            className="max-h-64 w-full resize-y overflow-auto font-mono text-xs"
          />
        </div>
      )}
      {!snapshot ? (
        <p role="status">{t.unavailable}</p>
      ) : (
        <Tabs defaultValue="page">
          <TabsList aria-label={t.title}>
            <TabsTrigger value="page">{t.page}</TabsTrigger>
            <TabsTrigger value="queries">
              {t.queries} ({snapshot.queries.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="page">
            <dl>
              {row(t.surface, snapshot.surface)}
              {row(t.route, snapshot.route.status)}
              {row(t.loading, snapshot.route.loading ? t.yes : t.no)}
              {row(
                t.language,
                `${snapshot.preferences.locale} / ${snapshot.preferences.localePreference}`,
              )}
              {row(
                t.theme,
                `${snapshot.preferences.resolvedTheme} / ${snapshot.preferences.theme}`,
              )}
              {row(t.search, snapshot.route.searchNames.join(", ") || t.none)}
            </dl>
            <h3 className="mb-2 mt-4 font-medium">{t.matches}</h3>
            <ul className="space-y-2">
              {snapshot.route.matches.map((match) => (
                <li key={match.template} className="min-w-0 border-b border-border pb-2">
                  <code className="break-words">{match.template}</code>
                  <span className="ml-2 text-muted-foreground">{match.status}</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.parameters}: {match.parameterNames.join(", ") || t.none}
                  </p>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="queries">
            {!snapshot.queries.length ? (
              <p className="py-4">{t.empty}</p>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">{t.queries}</caption>
                  <thead>
                    <tr>
                      {[t.label, t.status, t.fetch, t.stale, t.observers, t.updated].map(
                        (label) => (
                          <th className="border-b border-border p-2 font-medium" key={label}>
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.queries.map((query) => (
                      <tr key={query.id}>
                        <td className="border-b border-border p-2">
                          <span className="block font-medium">{query.label}</span>
                          <span className="text-muted-foreground">{query.id}</span>
                        </td>
                        <td className="border-b border-border p-2">{query.status}</td>
                        <td className="border-b border-border p-2">{query.fetchStatus}</td>
                        <td className="border-b border-border p-2">{query.stale ? t.yes : t.no}</td>
                        <td className="border-b border-border p-2">{query.observers}</td>
                        <td className="border-b border-border p-2">{query.updatedAt ?? t.none}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
