import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { useState } from "react";
import { IntlProvider, useFormatter, useLocale, useTranslations } from "./react.js";
import { LanguageProvider, useLanguagePreference } from "./language-provider.js";
import { messages } from "./messages/index.js";
import type { LocalePreference } from "./preferences.js";

afterEach(cleanup);

function Probe() {
  const locale = useLocale();
  const t = useTranslations("common");
  const formatter = useFormatter();
  return (
    <>
      <output data-testid="locale">{locale}</output>
      <output data-testid="message">{t("settings")}</output>
      <output data-testid="date">
        {formatter.dateTime(new Date("2026-01-01T01:00:00Z"), { day: "numeric" })}
      </output>
    </>
  );
}

describe("controlled internationalization", () => {
  it("adopts the locale and current catalog in the same render", () => {
    const { rerender } = render(
      <IntlProvider locale="en" messages={messages.en}>
        <Probe />
      </IntlProvider>,
    );
    expect(screen.getByTestId("message").textContent).toBe("Settings");
    rerender(
      <IntlProvider locale="zh" messages={messages.zh}>
        <Probe />
      </IntlProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("zh");
    expect(screen.getByTestId("message").textContent).toBe("设置");
  });

  it("uses product UTC defaults while accepting an explicit time zone", () => {
    const { rerender } = render(
      <IntlProvider locale="en" messages={messages.en}>
        <Probe />
      </IntlProvider>,
    );
    expect(screen.getByTestId("date").textContent).toBe("1");
    rerender(
      <IntlProvider locale="en" messages={messages.en} timeZone="America/Los_Angeles">
        <Probe />
      </IntlProvider>,
    );
    expect(screen.getByTestId("date").textContent).toBe("31");
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
    expect(screen.getByTestId("message").textContent).toBe("Settings");
  });
});
