import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
import { i18n } from "./i18n";

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: "/",
  i18n,
});
