import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Suspense, useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createCatalogLanguageProvider } from "../../../src/catalog-provider.js";
import { createCatalogStore } from "../../../src/catalog-store.js";
import en from "../../../src/messages/en.js";
import zh from "../../../src/messages/zh.js";
import type { LocalePreference } from "../../../src/preferences.js";
import { useLanguagePreference, useLocale, useTranslations } from "../../../src/react.js";
import type { Messages } from "../../../src/types.js";

afterEach(cleanup);

function deferred() {
  let resolve!: (catalog: Messages) => void;
  const promise = new Promise<Messages>((done) => (resolve = done));
  return { promise, resolve };
}

function Probe() {
  const { preference, setPreference } = useLanguagePreference();
  const locale = useLocale();
  const t = useTranslations("common");
  return (
    <>
      <output data-testid="state">{`${preference}:${locale}`}</output>
      <output data-testid="message">{t("settings")}</output>
      <button onClick={() => setPreference("zh")}>zh</button>
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
          messages={{} as never}
        >
          <Probe />
        </Provider>
      </Suspense>
    );
  };
}

describe("lazy catalog provider", () => {
  it("keeps the previous catalog while a selected language loads", async () => {
    const chunk = deferred();
    const Host = host(
      createCatalogLanguageProvider(createCatalogStore({ en, zh: () => chunk.promise })),
      "en",
    );
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "zh" }));
    expect(screen.getByTestId("state").textContent).toBe("zh:zh");
    expect(screen.getByTestId("message").textContent).toBe("Settings");
    await act(async () => chunk.resolve(zh));
    expect(screen.getByTestId("message").textContent).toBe("设置");
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
});
