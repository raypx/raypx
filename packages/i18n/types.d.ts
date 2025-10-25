declare module "@raypx/i18n/messages" {
  export const m: Record<string, (...args: any[]) => string>;
}

declare module "@raypx/i18n/runtime" {
  export const locales: readonly ["en", "zh"];
  export const baseLocale: "en";
  export type SetLocaleFn = (
    newLocale: Locale,
    options?: { reload?: boolean },
  ) => void | Promise<void>;
  export type Locale = (typeof locales)[number];
  export const getLocale: () => Locale;
  export function overwriteGetLocale(fn: () => Locale): void;
  export const setLocale: SetLocaleFn;
  export function overwriteSetLocale(fn: SetLocaleFn): void;
  export const getUrlOrigin: () => string;
  export function overwriteGetUrlOrigin(fn: () => string): void;
  export function extractLocaleFromRequest(request: Request): Locale;
  export function extractLocaleFromRequestAsync(request: Request): Promise<Locale>;
  export function localizeUrl(url: string | URL, options?: { locale?: string }): URL;
  export function deLocalizeUrl(url: string | URL): URL;
}

declare module "@raypx/i18n/server" {
  export function paraglideMiddleware<T>(
    request: Request,
    resolve: (args: { request: Request; locale: Locale }) => Promise<T> | T,
    callbacks?: { onRedirect: (response: Response) => void },
  ): Promise<Response>;
}
