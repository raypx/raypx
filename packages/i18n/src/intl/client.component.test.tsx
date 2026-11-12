import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { StrictMode, useState, type ReactNode } from "react";
import { useTranslations as useNativeTranslations } from "use-intl/react";

import { createIntlClient } from "./client.js";
import { createLocaleRuntime } from "./locale.js";
import type { CatalogShape, LocalePreference } from "./types.js";

const runtime = createLocaleRuntime({ locales: ["en", "de"], defaultLocale: "en" });
const en = {
  home: {
    greeting: "Hello {name}",
    rich: "Hello <strong>{name}</strong>",
    price: "Price {value, number, money}",
  },
} as const;
const de = {
  home: {
    greeting: "Hallo {name}",
    rich: "Hallo <strong>{name}</strong>",
    price: "Preis {value, number, money}",
  },
} satisfies CatalogShape<typeof en>;
const client = createIntlClient<typeof en>()(runtime, {
  formats: { number: { money: { style: "currency", currency: "EUR" } } },
});
const { IntlProvider, useLocale, useTranslations, useFormatter, useNow, useMessages, useTimeZone } =
  client;
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
      <output data-testid="catalog">{useMessages().home.greeting}</output>
    </>
  );
}
const now = new Date("2026-10-16T00:00:00Z");

describe("controlled native IntlProvider", () => {
  it("renders the explicit snapshot and adopts locale/catalog props immediately", () => {
    const { rerender } = render(
      <StrictMode>
        <IntlProvider locale="en" messages={en} now={now}>
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
      <IntlProvider locale="de" messages={de} now={now}>
        <Probe />
      </IntlProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("de");
    expect(screen.getByTestId("message").textContent).toBe("Hallo Ada");
    expect(screen.getByTestId("native").textContent).toBe("Hallo Ada");
    expect(screen.getByTestId("catalog").textContent).toBe("Hallo {name}");
  });

  it("uses nearest-provider semantics even when a hook comes from another factory", () => {
    const inner = createIntlClient<typeof en>()(runtime);
    render(
      <IntlProvider locale="en" messages={en}>
        <inner.IntlProvider locale="de" messages={de} now={now}>
          <Probe />
        </inner.IntlProvider>
      </IntlProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("de");
    expect(screen.getByTestId("message").textContent).toBe("Hallo Ada");
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
  });

  it("does not inherit a parent catalog when messages is explicitly null", () => {
    const dynamic = createIntlClient()(runtime);
    function Missing() {
      return <output>{dynamic.useTranslations("home")("greeting", { name: "Ada" })}</output>;
    }
    render(
      <IntlProvider locale="en" messages={en}>
        <dynamic.IntlProvider locale="en" messages={null}>
          <Missing />
        </dynamic.IntlProvider>
      </IntlProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("home.greeting");
  });

  it("resolves a controlled preference against system languages and records explicit choices", () => {
    const { LanguageProvider, useLanguagePreference } = client;
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
      const [preference, setPreference] = useState<LocalePreference<"en" | "de">>("system");
      return (
        <LanguageProvider
          preference={preference}
          onPreferenceChange={setPreference}
          systemLocales={["fr", "de-AT", "en-US"]}
          messages={{ en, de }}
          hydrated={false}
        >
          <Choice />
        </LanguageProvider>
      );
    }
    render(<Host />);
    expect(screen.getByTestId("preference").textContent).toBe("system:false");
    expect(screen.getByTestId("locale").textContent).toBe("de");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByTestId("preference").textContent).toBe("en:false");
    expect(screen.getByTestId("message").textContent).toBe("Hello Ada");
  });

  it("requires a LanguageProvider for preference hooks", () => {
    function Orphan() {
      client.useLanguagePreference();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow("LanguageProvider is required");
  });
});
