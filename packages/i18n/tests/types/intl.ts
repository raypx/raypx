import { expectTypeOf } from "vitest";
import { createTranslator } from "../../src/translator.js";
import { createFormatter } from "../../src/formatter.js";
import { createTranslations, type IntlProvider } from "../../src/react.js";
import type { CatalogShape, DynamicMessages, MessageKey, NamespaceOf } from "../../src/types.js";

const messages = {
  auth: {
    greeting: "Hi {name}",
    total: "{count, number}",
    day: "{date, date}",
    rich: "Hi <strong>{name}</strong>",
  },
  common: { save: "Save" },
} as const;
const useTranslations = createTranslations<typeof messages>();
const useDynamicTranslations = createTranslations<DynamicMessages>();
const date = new Date("2026-10-16T00:00:00Z");

function checkProviderProps(props: Parameters<typeof IntlProvider<typeof messages>>[0]) {
  void props;
}

// Compiled with the package, never run. Runtime fallback tests use intentionally dynamic catalogs.
export function usePublicTypeAssertions() {
  expectTypeOf<NamespaceOf<typeof messages>>().toEqualTypeOf<"auth" | "common">();
  expectTypeOf<MessageKey<typeof messages, "auth">>().toEqualTypeOf<
    "greeting" | "total" | "day" | "rich"
  >();

  const chinese: CatalogShape<typeof messages> = {
    auth: {
      greeting: "你好{name}",
      total: "{count, number}",
      day: "{date, date}",
      rich: "你好<strong>{name}</strong>",
    },
    common: { save: "保存" },
  };
  checkProviderProps({ locale: "zh", messages: chinese, children: null });
  checkProviderProps({ locale: "en", messages: null, children: null });
  // @ts-expect-error current catalog is required
  checkProviderProps({ locale: "en", children: null });
  // @ts-expect-error locale is bound to runtime
  checkProviderProps({ locale: "fr", messages, children: null });
  checkProviderProps({
    locale: "zh",
    // @ts-expect-error catalog must have the same key shape
    messages: { common: { save: "保存" } },
    children: null,
  });
  const translate = useTranslations("auth");
  translate("greeting", { name: "Ada" });
  translate("total", { count: 3n });
  translate("day", { date });
  void translate.rich("rich", { name: "Ada", strong: (chunks) => chunks });
  // @ts-expect-error invalid namespace
  useTranslations("autth");
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
  useDynamicTranslations("runtime.namespace")("runtime.key");
  // @ts-expect-error object formatter configuration is required
  createFormatter("en");
  // @ts-expect-error legacy numeric relativeTime signature has been removed
  createFormatter({ locale: "en" }).relativeTime(-1, "day", "numeric");
}
