import path from "node:path";
import _ from "lodash-es";

const project = path.join(import.meta.dirname, "./inlang");
const outDir = path.join(import.meta.dirname, "paraglide");
const urls = ["/", "/:path(.*)?"];

const locales = ["en", "zh"];
const baseLocale = "en";

const urlPatterns = urls.map((u) => ({
  pattern: u,
  localized: locales.map((l) => [l, _.trimEnd(path.join("/", l, u), "/")]),
}));

const getI18nConfig = (url) => {
  return {
    project: path.relative(url, project),
    outDir: path.relative(url, outDir),
  }
}

export {
  urls,
  outDir,
  locales,
  baseLocale,
  project,
  urlPatterns,
  getI18nConfig,
};