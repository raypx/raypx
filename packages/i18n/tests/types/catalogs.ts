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

const settings = createTranslator({ locale: "en", messages: messages.en, namespace: "settings" });
settings("searchResultCount", { count: 2 });
// @ts-expect-error Plural values must remain numeric.
settings("searchResultCount", { count: "two" });
