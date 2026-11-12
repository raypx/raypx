import { expectTypeOf } from "vite-plus/test";
import { createTranslator } from "../../src/intl/translator.js";
import { createFormatter } from "../../src/intl/formatter.js";
import { createIntlClient } from "../../src/intl/client.js";
import { createLocaleRuntime } from "../../src/intl/locale.js";
import type {
  CatalogShape,
  DynamicMessages,
  MessageKey,
  NamespaceOf,
} from "../../src/intl/types.js";

const messages = {
  auth: {
    greeting: "Hi {name}",
    total: "{count, number}",
    day: "{date, date}",
    rich: "Hi <strong>{name}</strong>",
  },
  common: { save: "Save" },
} as const;
// Compiled with the package, never run. Runtime fallback tests use intentionally dynamic catalogs.
export function publicTypeAssertions() {
  expectTypeOf<NamespaceOf<typeof messages>>().toEqualTypeOf<"auth" | "common">();
  expectTypeOf<MessageKey<typeof messages, "auth">>().toEqualTypeOf<
    "greeting" | "total" | "day" | "rich"
  >();

  const runtime = createLocaleRuntime({ locales: ["en", "zh"] as const, defaultLocale: "en" });
  const client = createIntlClient<typeof messages>()(runtime);
  const chinese: CatalogShape<typeof messages> = {
    auth: {
      greeting: "你好{name}",
      total: "{count, number}",
      day: "{date, date}",
      rich: "你好<strong>{name}</strong>",
    },
    common: { save: "保存" },
  };
  client.IntlProvider({ locale: "zh", messages: chinese, children: null });
  client.IntlProvider({ locale: "en", messages: null, children: null });
  // @ts-expect-error current catalog is required
  client.IntlProvider({ locale: "en", children: null });
  // @ts-expect-error locale is bound to runtime
  client.IntlProvider({ locale: "fr", messages, children: null });
  // @ts-expect-error catalog must have the same key shape
  client.IntlProvider({ locale: "zh", messages: { common: { save: "保存" } }, children: null });
  const translate = client.useTranslations("auth");
  translate("greeting", { name: "Ada" });
  translate("total", { count: 3n });
  translate("day", { date: new Date() });
  void translate.rich("rich", { name: "Ada", strong: (chunks) => chunks });
  // @ts-expect-error invalid namespace
  client.useTranslations("autth");
  // @ts-expect-error key is outside selected namespace
  translate("save");
  // @ts-expect-error missing required interpolation
  translate("greeting");
  // @ts-expect-error ICU number value is numeric
  translate("total", { count: "3" });
  // @ts-expect-error ICU date value is a Date
  translate("day", { date: "2026-10-16" });
  // @ts-expect-error rich callback name must match the catalog tag
  void translate.rich("rich", { name: "Ada", em: (chunks: unknown) => chunks });
  const core = createTranslator({ locale: "en", messages, namespace: "auth" });
  core("greeting", { name: "Ada" });
  // @ts-expect-error invalid key remains rejected by the standalone factory
  core("missing");
  // @ts-expect-error invalid namespace remains rejected by the standalone factory
  createTranslator({ locale: "en", messages, namespace: "autth" });
  const dynamic: DynamicMessages = messages;
  createTranslator({ locale: "en", messages: dynamic, namespace: "runtime.namespace" })(
    "runtime.key",
  );
  createIntlClient()(runtime).useTranslations("runtime.namespace")("runtime.key");
  // @ts-expect-error object formatter configuration is required
  createFormatter("en");
  // @ts-expect-error legacy numeric relativeTime signature has been removed
  createFormatter({ locale: "en" }).relativeTime(-1, "day", "numeric");
}
