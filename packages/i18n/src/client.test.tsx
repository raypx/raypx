import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { StrictMode } from "react";

import {
  AsyncI18nProvider,
  I18nProvider,
  createBrowserLocaleStorage,
  createLocalStorageLocaleStorage,
  useLocale,
  useFormatter,
  useSetLocale,
  useTranslations,
} from "./client.js";
import type { MessagesByLocale } from "./types.js";

const messages = {
  en: { home: { greeting: "Hello {name}" } },
  zh: { home: { greeting: "你好，{name}" } },
} satisfies MessagesByLocale;

afterEach(cleanup);

function Probe() {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useTranslations("home");
  return (
    <div>
      <output data-testid="locale">{locale}</output>
      <output data-testid="message">{t("greeting", { name: "Ada" })}</output>
      <button onClick={() => void setLocale("en").catch(() => undefined)}>English</button>
      <button onClick={() => void setLocale("zh").catch(() => undefined)}>中文</button>
    </div>
  );
}

function AsyncFormatterProbe() {
  const formatter = useFormatter();
  return (
    <output data-testid="async-formatted-date">
      {formatter.dateTime(new Date("2026-01-01T01:00:00.000Z"), {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })}
    </output>
  );
}

function probe(props: Partial<Omit<import("./client").I18nProviderProps, "children">> = {}) {
  return (
    <I18nProvider locale="en" messages={messages} {...props}>
      <Probe />
    </I18nProvider>
  );
}

function asyncProbe({
  locale = "en",
  messages: catalog = messages[locale],
  children = <Probe />,
  ...props
}: Partial<import("./client").AsyncI18nProviderProps> &
  Pick<import("./client").AsyncI18nProviderProps, "loadCatalog">) {
  return (
    <AsyncI18nProvider locale={locale} messages={catalog} {...props}>
      {children}
    </AsyncI18nProvider>
  );
}

function pendingCatalog() {
  let resolve!: (catalog: typeof messages.zh) => void;
  const promise = new Promise<typeof messages.zh>((done) => {
    resolve = done;
  });
  return { loadCatalog: vi.fn(() => promise), resolve };
}

describe("I18nProvider", () => {
  it("renders a complete static catalog without suspending and switches locale", async () => {
    const write = vi.fn();
    render(<StrictMode>{probe({ storage: { read: () => "en", write } })}</StrictMode>);

    expectLocale("en", "Hello Ada");

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(write).toHaveBeenCalledWith("zh");

    expect((await screen.findByTestId("locale")).textContent).toBe("zh");
    expect(screen.getByTestId("message").textContent).toBe("你好，Ada");
    expect(write).toHaveBeenCalledWith("zh");
  });

  it("adopts a new locale when the provider props change", async () => {
    const { rerender } = render(probe({}));

    rerender(probe({ locale: "zh" }));

    await waitFor(() => {
      expectLocale("zh", "你好，Ada");
    });
  });

  it("keeps the locale and storage update when the side-effect callback fails", async () => {
    const write = vi.fn();
    const onLocaleChange = vi.fn(async () => {
      throw new Error("document update failed");
    });

    render(probe({ onLocaleChange: onLocaleChange, storage: { read: () => "en", write } }));

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect((await screen.findByTestId("locale")).textContent).toBe("zh");
    expect(screen.getByTestId("message").textContent).toBe("你好，Ada");
    expect(write).toHaveBeenCalledWith("zh");
    expect(onLocaleChange).toHaveBeenCalledWith("zh");
  });

  it.each([
    ["is a no-op", () => {}],
    [
      "throws",
      () => {
        throw new Error("storage unavailable");
      },
    ],
  ] as const)("keeps an in-memory switch when locale persistence %s", async (_name, write) => {
    const onLocaleChange = vi.fn();
    render(probe({ onLocaleChange, storage: { read: () => "en", write } }));
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("zh"));
    expect(onLocaleChange).toHaveBeenCalledWith("zh");
  });

  it("uses the shared cookie and localStorage locale adapters", () => {
    document.cookie = "locale=zh";
    const browserStorage = createBrowserLocaleStorage();
    expect(browserStorage.read()).toBe("zh");
    browserStorage.write("en");
    expect(document.cookie).toContain("locale=en");

    const localStorage = createLocalStorageLocaleStorage();
    localStorage.write("zh");
    expect(localStorage.read()).toBe("zh");
  });

  it.each(["synchronous", "asynchronous"])(
    "remains interactive under StrictMode: %s",
    async (mode) => {
      const loadCatalog = async (locale: keyof typeof messages) => messages[locale];
      render(
        <StrictMode>{mode === "synchronous" ? probe() : asyncProbe({ loadCatalog })}</StrictMode>,
      );
      fireEvent.click(screen.getByRole("button", { name: "中文" }));
      await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("zh"));
      expect((await screen.findByTestId("locale")).textContent).toBe("zh");
    },
  );
});

describe("AsyncI18nProvider", () => {
  it("renders the initial catalog without loading another locale", () => {
    const loadCatalog = vi.fn(async (locale: keyof typeof messages) => messages[locale]);

    render(asyncProbe({ loadCatalog }));

    expectLocale("en", "Hello Ada");
    expect(loadCatalog).not.toHaveBeenCalled();
  });

  it("passes formatter options through the async provider context", () => {
    const loadCatalog = vi.fn(async (locale: keyof typeof messages) => messages[locale]);

    render(
      asyncProbe({
        loadCatalog,
        timeZone: "America/Los_Angeles",
        children: <AsyncFormatterProbe />,
      }),
    );

    expect(screen.getByTestId("async-formatted-date").textContent).toContain("12/31/2025");
  });

  it("adopts a new locale and catalog when the provider props change", async () => {
    const loadCatalog = vi.fn(async (locale: keyof typeof messages) => messages[locale]);
    const { rerender } = render(asyncProbe({ loadCatalog }));

    rerender(asyncProbe({ locale: "zh", messages: messages.zh, loadCatalog }));

    await waitFor(() => {
      expectLocale("zh", "你好，Ada");
    });
    expect(loadCatalog).not.toHaveBeenCalled();
  });

  it("ignores a pending switch after newer provider props arrive", async () => {
    const { loadCatalog, resolve: resolveChinese } = pendingCatalog();
    const refreshedEnglish = { home: { greeting: "Hello refreshed {name}" } };
    const { rerender } = render(asyncProbe({ loadCatalog }));

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    rerender(asyncProbe({ locale: "en", messages: refreshedEnglish, loadCatalog }));
    resolveChinese?.(messages.zh);

    await waitFor(() => {
      expectLocale("en", "Hello refreshed Ada");
    });
  });

  it("loads a target catalog once and commits locale and messages together", async () => {
    const write = vi.fn();
    const loadCatalog = vi.fn(async (locale: keyof typeof messages) => messages[locale]);

    render(
      asyncProbe({
        loadCatalog,
        storage: { read: () => "en", write },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    await waitFor(() => {
      expectLocale("zh", "你好，Ada");
    });
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    expect(loadCatalog).toHaveBeenCalledWith("zh");
    expect(write).toHaveBeenCalledWith("zh");
  });

  it("shares the pending catalog promise across concurrent requests", async () => {
    const { loadCatalog, resolve: resolveCatalog } = pendingCatalog();

    render(asyncProbe({ loadCatalog }));

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(loadCatalog).toHaveBeenCalledTimes(1);

    resolveCatalog?.(messages.zh);
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("zh"));
  });

  it("keeps the current locale after a load failure and retries later", async () => {
    const loadCatalog = vi
      .fn<() => Promise<typeof messages.zh>>()
      .mockRejectedValueOnce(new Error("catalog unavailable"))
      .mockResolvedValueOnce(messages.zh);

    render(asyncProbe({ loadCatalog }));

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("locale").textContent).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("zh"));
    expect(loadCatalog).toHaveBeenCalledTimes(2);
  });

  it("does not commit a stale catalog after a newer locale request", async () => {
    const { loadCatalog, resolve: resolveChinese } = pendingCatalog();
    const write = vi.fn();

    render(
      asyncProbe({
        loadCatalog,
        storage: { read: () => "en", write },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    resolveChinese?.(messages.zh);

    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("en"));
    expect(screen.getByTestId("message").textContent).toBe("Hello Ada");
    expect(write).not.toHaveBeenCalled();
  });
});

function expectLocale(locale: string, text: string) {
  expect(screen.getByTestId("locale").textContent).toBe(locale);
  expect(screen.getByTestId("message").textContent).toBe(text);
}
