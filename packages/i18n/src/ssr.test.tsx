import { describe, expect, it } from "vite-plus/test";
import { Suspense, use } from "react";
import { renderToReadableStream } from "react-dom/server";
import { IntlProvider, useLocale, useTranslations } from "./react.js";
import { messages } from "./messages/index.js";

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
      const locale = useLocale();
      return <p>{`${locale}:${t("settings")}`}</p>;
    }
    const [englishStream, chineseStream] = await Promise.all([
      renderToReadableStream(
        <IntlProvider locale="en" messages={messages.en}>
          <Suspense fallback="loading">
            <Delayed ready={english.promise} />
          </Suspense>
        </IntlProvider>,
      ),
      renderToReadableStream(
        <IntlProvider locale="zh" messages={messages.zh}>
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
    expect(englishHtml).toContain("en:Settings");
    expect(englishHtml).not.toContain("设置");
    expect(chineseHtml).toContain("zh:设置");
    expect(chineseHtml).not.toContain("Settings");
  });
});
