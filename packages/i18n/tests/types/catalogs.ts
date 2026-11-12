import { createTranslator } from "../../src/index.js";
import { messages } from "../../locales/index.js";

const common = createTranslator({ locale: "en", messages: messages.en, namespace: "common" });
common("deleteNamed", { name: "draft" });
// @ts-expect-error Split catalogs must retain required ICU arguments.
common("deleteNamed");
// @ts-expect-error Split catalogs must retain exact argument names.
common("deleteNamed", { title: "draft" });
// @ts-expect-error Unknown keys remain rejected with split catalogs.
common("unknownMessage");

const counts = createTranslator({
  locale: "en",
  messages: { count: "{count, plural, one {# item} other {# items}}" } as const,
});
counts("count", { count: 2 });
// @ts-expect-error Plural values must remain numeric.
counts("count", { count: "two" });

import json from "../fixtures/en.json" with { type: "json" };
import { createTranslations } from "../../src/browser.js";
const jsonTranslator = createTranslator({ locale: "en", messages: json, namespace: "probe" });
jsonTranslator("greeting", { name: "Ada" });
// JSON values widen to string: keys stay typed, but call-site ICU arguments are not inferred.
jsonTranslator("greeting");
// @ts-expect-error JSON catalogs must still reject unknown keys.
jsonTranslator("unknownMessage");
const useJsonTranslations = createTranslations<typeof json>();
function useJsonHookTypes() {
  const t = useJsonTranslations("probe");
  t("greeting", { name: "Ada" });
  // @ts-expect-error JSON hooks must still reject unknown keys.
  t("unknownMessage");
  // @ts-expect-error JSON hooks must still reject unknown namespaces.
  useJsonTranslations("missing");
}
void useJsonHookTypes;

const useTsTranslations = createTranslations<
  typeof messages.en & {
    feature: {
      count: "{count, plural, one {# item} other {# items}}";
      rich: "<strong>{name}</strong>";
    };
  }
>();
function useTsHookTypes() {
  const shared = useTsTranslations("common");
  shared("deleteNamed", { name: "draft" });
  // @ts-expect-error TS hooks retain required ICU parameters.
  shared("deleteNamed");
  // @ts-expect-error TS hooks reject unknown keys.
  shared("unknownMessage");
  const feature = useTsTranslations("feature");
  feature("count", { count: 2 });
  // @ts-expect-error TS hooks retain numeric plural parameters.
  feature("count", { count: "two" });
  void feature.rich("rich", { name: "Ada", strong: (chunks) => chunks });
  // @ts-expect-error Rich-text callbacks remain required for TS English baselines.
  void feature.rich("rich", { name: "Ada" });
}
void useTsHookTypes;
