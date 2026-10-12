import {
  finding,
  type I18nFinding,
  type I18nReport,
  type CatalogInput,
  type SourceInput,
  type SupportedLocale,
} from "./model.js";
import { checkCatalogPair } from "./catalogs.js";
import { checkSourceFile } from "./source.js";
export * from "./model.js";
export { checkCatalogPair, checkSourceFile };
export function createI18nReport(findings: I18nFinding[]): I18nReport {
  const sorted = [...findings].sort((left, right) => {
    const location = left.location.localeCompare(right.location);
    if (location !== 0) return location;
    if (left.line !== right.line) return left.line - right.line;
    if (left.column !== right.column) return left.column - right.column;
    return left.message.localeCompare(right.message);
  });
  return {
    errors: sorted.filter((item) => item.severity === "error").length,
    findings: sorted,
    warnings: sorted.filter((item) => item.severity === "warn").length,
  };
}

/** Runs catalog parity and source checks over injected repository content. */
export function runI18nChecks(
  catalogs: readonly CatalogInput[],
  sources: readonly SourceInput[],
): I18nReport {
  const findings: I18nFinding[] = [];
  const bySurface = new Map<string, Map<SupportedLocale, CatalogInput>>();
  for (const catalog of catalogs) {
    const surface = bySurface.get(catalog.surface) ?? new Map<SupportedLocale, CatalogInput>();
    if (surface.has(catalog.locale)) {
      findings.push(
        finding(
          "catalog.parse",
          catalog.location,
          `duplicate ${catalog.locale} catalog for ${catalog.surface}`,
          "keep one messages/<locale>.json file per surface and locale",
        ),
      );
    }
    surface.set(catalog.locale, catalog);
    bySurface.set(catalog.surface, surface);
  }

  for (const [surface, locales] of bySurface) {
    const left = locales.get("en");
    const right = locales.get("zh");
    if (!left || !right) {
      const missing = left ? "zh" : "en";
      findings.push(
        finding(
          "catalog.parity",
          left?.location ?? right?.location ?? `messages/${missing}.json`,
          `${surface} is missing its ${missing} catalog`,
          `add ${surface}/messages/${missing}.json`,
        ),
      );
    } else {
      findings.push(...checkCatalogPair(left, right));
    }
  }

  for (const source of sources) findings.push(...checkSourceFile(source));
  return createI18nReport(findings);
}
