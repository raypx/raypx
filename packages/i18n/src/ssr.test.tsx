import { describe, expect, it } from "vite-plus/test";
import { Suspense, use } from "react";
import { renderToReadableStream } from "react-dom/server";
import { createTranslations, IntlProvider, useLocale } from "./react.js";
import { useTranslations } from "../tests/i18n.js";
import { messages } from "../locales/index.js";
import en from "../tests/fixtures/en.json" with { type: "json" };
import zh from "../tests/fixtures/zh.json" with { type: "json" };

const useFeatureTranslations = createTranslations<typeof en>();

describe("request-scoped internationalization", () => {
  it("isolates simultaneous streamed SSR requests across suspension", async () => {
    expect(typeof document).toBe("undefined");
    function gate() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }
    const english = gate();
    const chinese = gate();
    function Delayed({ ready }: { ready: Promise<void> }) {
      use(ready);
      const t = useTranslations("common");
      const feature = useFeatureTranslations("probe");
      const locale = useLocale();
      return <p>{`${locale}:${t("settings")}:${feature("greeting", { name: "Ada" })}`}</p>;
    }
    const [englishStream, chineseStream] = await Promise.all([
      renderToReadableStream(
        <IntlProvider locale="en" messages={{ ...messages.en, ...en }}>
          <Suspense fallback="loading">
            <Delayed ready={english.promise} />
          </Suspense>
        </IntlProvider>,
      ),
      renderToReadableStream(
        <IntlProvider locale="zh" messages={{ ...messages.zh, ...zh }}>
          <Suspense fallback="loading">
            <Delayed ready={chinese.promise} />
          </Suspense>
        </IntlProvider>,
      ),
    ]);
    // Resume in the reverse order after both request trees have suspended.
    chinese.resolve();
    english.resolve();
    await Promise.all([englishStream.allReady, chineseStream.allReady]);
    const [englishHtml, chineseHtml] = await Promise.all([
      new Response(englishStream).text(),
      new Response(chineseStream).text(),
    ]);
    expect(englishHtml).toContain("en:Settings:Hello Ada");
    expect(englishHtml).not.toContain("设置");
    expect(chineseHtml).toContain("zh:设置:你好 Ada");
    expect(chineseHtml).not.toContain("Settings");
  });
});
