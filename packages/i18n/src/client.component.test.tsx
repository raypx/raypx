import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StrictMode, useState, type ReactNode } from "react";
import { useTranslations as useNativeTranslations } from "use-intl/react";
import { createCatalogLanguageProvider } from "./catalog-provider.js";
import { createCatalogStore } from "./catalog-store.js";

import {
  createTranslations,
  IntlProvider,
  useFormatter,
  useLanguagePreference,
  useLocale,
  useMessages,
  useNow,
  useTimeZone,
} from "./react.js";
import type { LocalePreference } from "./preferences.js";
import type { CatalogShape, DynamicMessages } from "./types.js";

const en = {
  home: {
    greeting: "Hello {name}",
    rich: "Hello <strong>{name}</strong>",
    price: "Price {value, number, money}",
  },
} as const;
const zh = {
  home: {
    greeting: "你好{name}",
    rich: "你好<strong>{name}</strong>",
    price: "价格 {value, number, money}",
  },
} satisfies CatalogShape<typeof en>;
const useTranslations = createTranslations<typeof en>();
const useOtherTranslations = createTranslations<typeof en>();
const useDynamicTranslations = createTranslations<DynamicMessages>();
const LanguageProvider = createCatalogLanguageProvider(createCatalogStore({ en, zh }));
const formats = { number: { money: { style: "currency", currency: "EUR" } } } as const;
afterEach(cleanup);

function strong(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
}

function Probe() {
  const t = useTranslations("home");
  const native = useNativeTranslations("home");
  const formatter = useFormatter();
  return (
    <>
      <output data-testid="locale">{useLocale()}</output>
      <output data-testid="message">{t("greeting", { name: "Ada" })}</output>
      <output data-testid="native">{native("greeting", { name: "Ada" })}</output>
      <output data-testid="rich">{t.rich("rich", { name: "Ada", strong })}</output>
      <output data-testid="price">
        {t("price", { value: 2 })}:{formatter.number(2, "money")}
      </output>
      <output data-testid="zone">{useTimeZone()}</output>
      <output data-testid="now">{useNow().toISOString()}</output>
      <output data-testid="catalog">{useMessages<typeof en>().home.greeting}</output>
    </>
  );
}
const now = new Date("2026-10-16T00:00:00Z");

describe("controlled native IntlProvider", () => {
  it("renders the explicit snapshot and adopts locale/catalog props immediately", () => {
    const { rerender } = render(
      <StrictMode>
        <IntlProvider locale="en" messages={en} now={now} formats={formats}>
          <Probe />
        </IntlProvider>
      </StrictMode>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("message").textContent).toBe("Hello Ada");
    expect(screen.getByTestId("native").textContent).toBe("Hello Ada");
    expect(screen.getByTestId("rich").querySelector("strong")?.textContent).toBe("Ada");
    expect(screen.getByTestId("price").textContent).toBe("Price €2.00:€2.00");
    expect(screen.getByTestId("zone").textContent).toBe("UTC");
    expect(screen.getByTestId("now").textContent).toBe(now.toISOString());
    rerender(
      <IntlProvider locale="zh" messages={zh} formats={formats} now={now}>
        <Probe />
      </IntlProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("zh");
    expect(screen.getByTestId("message").textContent).toBe("你好Ada");
    expect(screen.getByTestId("native").textContent).toBe("你好Ada");
    expect(screen.getByTestId("catalog").textContent).toBe("你好{name}");
  });

  it("uses the nearest provider across independently typed bindings", () => {
    function OtherProbe() {
      return <output>{useOtherTranslations("home")("greeting", { name: "Ada" })}</output>;
    }
    render(
      <IntlProvider locale="en" messages={en} formats={formats}>
        <IntlProvider locale="zh" messages={zh} formats={formats}>
          <Probe />
          <OtherProbe />
        </IntlProvider>
      </IntlProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("zh");
    expect(screen.getByTestId("message").textContent).toBe("你好Ada");
    expect(screen.getAllByText("你好Ada")).toHaveLength(3);
  });

  it("accepts a locale-only snapshot and explicit provider configuration overrides", () => {
    function FormatProbe() {
      return (
        <output>
          {useLocale()}:{useFormatter().dateTime(now, "short")}
        </output>
      );
    }
    const { rerender } = render(
      <IntlProvider locale="en" messages={null}>
        <FormatProbe />
      </IntlProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("en:Oct 16, 2026");
    rerender(
      <IntlProvider
        locale="en"
        messages={null}
        formats={{ dateTime: { short: { dateStyle: "short" } } }}
      >
        <FormatProbe />
      </IntlProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("en:10/16/26");
    rerender(
      <IntlProvider locale="en" messages={null} timeZone="America/Los_Angeles">
        <FormatProbe />
      </IntlProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("en:Oct 15, 2026");
  });

  it("does not inherit a parent catalog when messages is explicitly null", () => {
    function Missing() {
      return <output>{useDynamicTranslations("home")("greeting", { name: "Ada" })}</output>;
    }
    render(
      <IntlProvider locale="en" messages={en} formats={formats}>
        <IntlProvider locale="en" messages={null}>
          <Missing />
        </IntlProvider>
      </IntlProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("home.greeting");
  });

  it("resolves a controlled preference against system languages and records explicit choices", () => {
    function Choice() {
      const { preference, setPreference, hydrated } = useLanguagePreference();
      return (
        <>
          <span data-testid="preference">{`${preference}:${hydrated}`}</span>
          <button onClick={() => setPreference("en")}>English</button>
          <Probe />
        </>
      );
    }
    function Host() {
      const [preference, setPreference] = useState<LocalePreference>("system");
      return (
        <LanguageProvider
          preference={preference}
          onPreferenceChange={setPreference}
          systemLocales={["fr", "zh-TW", "en-US"]}
          formats={formats}
          hydrated={false}
        >
          <Choice />
        </LanguageProvider>
      );
    }
    render(<Host />);
    expect(screen.getByTestId("preference").textContent).toBe("system:false");
    expect(screen.getByTestId("locale").textContent).toBe("zh");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByTestId("preference").textContent).toBe("en:false");
    expect(screen.getByTestId("message").textContent).toBe("Hello Ada");
  });

  it("requires a LanguageProvider for preference hooks", () => {
    function Orphan() {
      useLanguagePreference();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow("LanguageProvider is required");
  });
  it("records an explicit choice even when system currently resolves to that locale", () => {
    function Choice() {
      const { preference, setPreference } = useLanguagePreference();
      return (
        <>
          <span>{preference}</span>
          <button onClick={() => setPreference("en")}>English</button>
          <Probe />
        </>
      );
    }
    function Host() {
      const [preference, setPreference] = useState<LocalePreference>("system");
      return (
        <LanguageProvider
          formats={formats}
          preference={preference}
          onPreferenceChange={setPreference}
          systemLocales={["fr", "en-US"]}
        >
          <Choice />
        </LanguageProvider>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("en", { selector: "span" })).toBeTruthy();
    expect(screen.getByTestId("message").textContent).toBe("Hello Ada");
  });
});
