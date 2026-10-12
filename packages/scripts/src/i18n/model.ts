export const supportedLocales = ["en", "zh"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export type I18nCheckName =
  | "catalog.parse"
  | "catalog.parity"
  | "source.parse"
  | "source.facade"
  | "source.hardcoded"
  | "source.locale";

export interface I18nFinding {
  check: I18nCheckName;
  column: number;
  fix: string;
  line: number;
  location: string;
  message: string;
  severity: "error" | "warn";
}

export interface I18nReport {
  errors: number;
  findings: I18nFinding[];
  warnings: number;
}

export interface CatalogInput {
  content: string;
  locale: SupportedLocale;
  location: string;
  surface: "web" | "desktop" | "mail";
}

export interface SourceInput {
  content: string;
  location: string;
}

export function finding(
  check: I18nCheckName,
  location: string,
  message: string,
  fix: string,
  content = "",
  offset = 0,
): I18nFinding {
  const lineStart = content.lastIndexOf("\n", offset - 1);
  const line = content.slice(0, offset).split("\n").length;
  return {
    check,
    column: offset - lineStart,
    fix,
    line,
    location,
    message,
    severity: "error",
  };
}
