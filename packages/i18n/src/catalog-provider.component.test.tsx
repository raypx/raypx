import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, Suspense, startTransition, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCatalogLanguageProvider } from "./catalog-provider.js";
import { createCatalogStore } from "./catalog-store.js";
import en from "../locales/en/index.js";
import zh from "../locales/zh/index.js";
import type { LocalePreference } from "./preferences.js";
import { useFormatter, useLanguagePreference, useLocale } from "./react.js";
import { useTranslations } from "../tests/i18n.js";
import type { Messages } from "./types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: (catalog: Messages) => void;
  const promise = new Promise<Messages>((done) => (resolve = done));
  return { promise, resolve };
}

function Probe() {
  const { preference, setPreference, loadStatus, retry } = useLanguagePreference();
  const locale = useLocale();
  const t = useTranslations("common");
  const formatter = useFormatter();
  const [draft, setDraft] = useState("");
  return (
    <>
      <output data-testid="state">{`${preference}:${locale}`}</output>
      <output data-testid="message">{t("settings")}</output>
      <output data-testid="date">
        {formatter.dateTime(new Date("2026-01-01T00:00:00Z"), "timestamp")}
      </output>
      <output data-testid="load-status">{loadStatus}</output>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button onClick={() => setPreference("en")}>en</button>
      <button onClick={() => setPreference("zh")}>zh</button>
      {loadStatus === "failed" && <button onClick={retry}>Retry</button>}
    </>
  );
}

function host(
  Provider: ReturnType<typeof createCatalogLanguageProvider>,
  initial: LocalePreference,
) {
  return function Host() {
    const [preference, setPreference] = useState(initial);
    return (
      <Suspense fallback={<output data-testid="loading" />}>
        <Provider
          preference={preference}
          onPreferenceChange={setPreference}
          systemLocales={["en-US"]}
        >
          <Probe />
        </Provider>
      </Suspense>
    );
  };
}

describe("lazy catalog provider", () => {
  it("keeps the active locale, catalog, formats and draft together during a switch", async () => {
    const chunk = deferred();
    const Host = host(
      createCatalogLanguageProvider(createCatalogStore({ en, zh: () => chunk.promise })),
      "en",
    );
    render(<Host />);
    const date = screen.getByTestId("date").textContent;
    const draft = screen.getByRole("textbox", { name: "Draft" });
    fireEvent.change(draft, { target: { value: "in progress" } });
    fireEvent.click(screen.getByRole("button", { name: "zh" }));
    expect(screen.getByTestId("state").textContent).toBe("zh:en");
    expect(screen.getByTestId("load-status").textContent).toBe("loading");
    expect(screen.getByTestId("message").textContent).toBe("Settings");
    expect(screen.getByTestId("date").textContent).toBe(date);
    await act(async () => chunk.resolve(zh));
    expect(screen.getByTestId("state").textContent).toBe("zh:zh");
    expect(screen.getByTestId("load-status").textContent).toBe("ready");
    expect(screen.getByTestId("message").textContent).toBe("设置");
    expect(screen.getByTestId("date").textContent).not.toBe(date);
    expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
    expect((draft as HTMLInputElement).value).toBe("in progress");
  });

  it("retries a failed selection without changing preferences again", async () => {
    const chunk = deferred();
    const load = vi.fn(() => chunk.promise).mockRejectedValueOnce(new Error("offline"));
    const Host = host(createCatalogLanguageProvider(createCatalogStore({ en, zh: load })), "en");
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "zh" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(screen.getByTestId("state").textContent).toBe("zh:en");
    expect(screen.getByTestId("load-status").textContent).toBe("loading");
    await act(async () => chunk.resolve(zh));
    expect(screen.getByTestId("message").textContent).toBe("设置");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a late catalog from overriding a newer choice", async () => {
    const chunk = deferred();
    const Host = host(
      createCatalogLanguageProvider(createCatalogStore({ en, zh: () => chunk.promise })),
      "en",
    );
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "zh" }));
    fireEvent.click(screen.getByRole("button", { name: "en" }));
    await act(async () => chunk.resolve(zh));
    expect(screen.getByTestId("state").textContent).toBe("en:en");
    expect(screen.getByTestId("message").textContent).toBe("Settings");
  });

  it("suspends only when no catalog is ready yet", async () => {
    const chunk = deferred();
    const store = createCatalogStore({ en: () => Promise.resolve(en), zh: () => chunk.promise });
    const Host = host(createCatalogLanguageProvider(store), "zh");
    // The first render suspends, so it must run inside an awaited act scope.
    await act(async () => {
      render(<Host />);
    });
    expect(screen.getByTestId("loading")).toBeTruthy();
    await act(async () => chunk.resolve(zh));
    expect(screen.getByTestId("message").textContent).toBe("设置");
  });

  it("resumes a hydration that waited for the server language's catalog", async () => {
    // Mirrors the web root: StrictMode, transition hydration and no Suspense boundary
    // above the provider, with the server language's chunk still loading.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = (Provider: ReturnType<typeof createCatalogLanguageProvider>) => (
      <StrictMode>
        <Provider preference="zh" onPreferenceChange={() => {}} systemLocales={["en-US"]}>
          <Probe />
        </Provider>
      </StrictMode>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      app(createCatalogLanguageProvider(createCatalogStore({ en, zh }))),
    );
    document.body.append(container);
    const chunk = deferred();
    const Provider = createCatalogLanguageProvider(
      createCatalogStore({ en, zh: () => chunk.promise }),
    );
    let root: Root | undefined;
    await act(async () => {
      startTransition(() => {
        root = hydrateRoot(container, app(Provider));
      });
    });
    expect(screen.getByTestId("message").textContent).toBe("设置");
    await act(async () => chunk.resolve(zh));
    expect(screen.getByTestId("state").textContent).toBe("zh:zh");
    expect(consoleError).not.toHaveBeenCalled();
    act(() => root?.unmount());
    container.remove();
  });
});
