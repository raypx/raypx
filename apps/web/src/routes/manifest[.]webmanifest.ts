import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { normalizeLocale } from "@voidmix/i18n";
import { resolveRequestLocale } from "@voidmix/i18n/server";
import type { Locale, MessageCatalog } from "@voidmix/i18n/types";

import { loadWebMessages } from "../../i18n/messages";
import type { CommonMessageKey } from "../i18n/route-meta";

const manifest = {
  id: "/",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#FAFAFA",
  theme_color: "#0A0A0A",
  lang: "en" as Locale,
  dir: "ltr",
  icons: [
    {
      src: "/favicon.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
  ],
} as const;

function commonMessage(messages: MessageCatalog, key: CommonMessageKey): string | undefined {
  const common = messages.common;
  if (typeof common !== "object" || common === null || Array.isArray(common)) return undefined;
  const value = (common as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function resolveManifestLocale(request: Request, headers: Headers): Locale {
  const queryLocale = normalizeLocale(new URL(request.url).searchParams.get("locale"));
  return queryLocale ?? resolveRequestLocale(headers);
}

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const locale = resolveManifestLocale(request, getRequestHeaders());
        const messages = await loadWebMessages(locale);
        const localized = {
          ...manifest,
          name: commonMessage(messages, "manifestName") ?? "Voidmix",
          short_name: commonMessage(messages, "manifestShortName") ?? "Voidmix",
          description: commonMessage(messages, "manifestDescription") ?? "",
          lang: locale,
        };
        return new Response(JSON.stringify(localized), {
          headers: {
            "cache-control": "public, max-age=3600, s-maxage=86400",
            "content-type": "application/manifest+json; charset=utf-8",
            vary: "Cookie, Accept-Language",
          },
        });
      },
    },
  },
});
