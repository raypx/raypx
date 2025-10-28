import { loader } from "fumadocs-core/source";
import { create, docs } from "../../.source";
import { docsI18nConfig } from "./docs/i18n";

export const source = loader({
  source: await create.sourceAsync(docs.doc, docs.meta),
  baseUrl: "/docs",
  i18n: docsI18nConfig,
});
