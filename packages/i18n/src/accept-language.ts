import type { AcceptLanguagePreference } from "./types.js";

export function parseAcceptLanguage(header: string | null | undefined): AcceptLanguagePreference[] {
  if (!header) return [];

  return header
    .split(",")
    .map((entry, index) => {
      const [localePart, ...params] = entry.trim().split(";");
      const qualityParam = params.find((param) => param.trim().toLowerCase().startsWith("q="));
      const quality = qualityParam ? Number(qualityParam.trim().slice(2)) : 1;
      return {
        locale: localePart?.trim() ?? "",
        quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0,
        index,
      };
    })
    .filter((preference) => preference.locale.length > 0 && preference.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map(({ locale, quality }) => ({ locale, quality }));
}
