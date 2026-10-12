import type { TranslationValues } from "@voidmix/i18n";

/** An error carrying a stable, localizable code across feature boundaries. */
export class LocalizedWebError extends Error {
  readonly code: string;
  readonly values?: TranslationValues;

  constructor(code: string, values?: TranslationValues) {
    super(code);
    this.name = "LocalizedWebError";
    this.code = code;
    if (values) this.values = values;
  }
}
