import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { LanguageVariables } from "hono/language";
import { basePath } from "hono/route";
import { DEFAULT_LOCALE, isLocale } from "@raypx/i18n";
import type { Locale } from "@raypx/i18n/types";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import type { ApiAppOptions } from "../app/options.js";
import type { ApiRouterEnv } from "../routers/request.js";

const emailSignupPath = "/sign-up/email";
const mailPaths = [emailSignupPath, "/send-verification-email", "/request-password-reset"];

export type AuthRouteEnv = {
  Variables: ApiRouterEnv["Variables"] & LanguageVariables;
};
type AuthErrorCode = keyof typeof en.api;
const messages = { en: en.api, zh: zh.api } satisfies Record<Locale, Record<AuthErrorCode, string>>;

function authError(c: Context<AuthRouteEnv>, code: AuthErrorCode, status: 403 | 503) {
  const language = c.get("language");
  const locale = isLocale(language) ? language : DEFAULT_LOCALE;
  c.header("Content-Language", locale);
  c.header("Vary", "Accept-Language", { append: true });
  return c.json({ code, message: messages[locale][code] }, status);
}

export function authPreflight(options: Pick<ApiAppOptions, "mailAvailable" | "configuration">) {
  return createMiddleware<AuthRouteEnv>(async (c, next) => {
    const mount = basePath(c).replace(/\/$/, "");
    const path = decodeURIComponent(c.req.path.slice(mount.length)).replace(/\/+$/, "");
    if (
      c.req.method === "POST" &&
      mailPaths.includes(path) &&
      (await options.mailAvailable?.()) === false
    ) {
      return authError(c, "MAIL_NOT_CONFIGURED", 503);
    }
    if (c.req.method === "POST" && path === emailSignupPath) {
      try {
        // Cheap early answer; the auth user-create hook re-checks with a fresh read.
        if (!(await options.configuration.readCached()).values.registrationEnabled)
          return authError(c, "REGISTRATION_DISABLED", 403);
      } catch {
        return authError(c, "CONFIGURATION_UNAVAILABLE", 503);
      }
    }
    await next();
  });
}
