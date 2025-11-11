export type Strategy =
  | "cookie"
  | "baseLocale"
  | "globalVariable"
  | "url"
  | "preferredLanguage"
  | "localStorage"
  | `custom-${string}`;
