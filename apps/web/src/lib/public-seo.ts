import { env } from "../env";
import { localizedRouteHead, type CommonMessageKey } from "../i18n/route-meta";
export function publicSeo(
  path: string,
  matches: readonly { loaderData?: unknown }[],
  titleKey: CommonMessageKey,
  descriptionKey: CommonMessageKey,
) {
  const url = env.VITE_SITE_URL ? new URL(path, env.VITE_SITE_URL).href : undefined;
  const localized = localizedRouteHead(matches, titleKey, descriptionKey);
  const title = localized.meta[0]?.title ?? "";
  const description = localized.meta[1]?.content ?? "";
  return {
    meta: [
      ...localized.meta,
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      ...(url ? [{ property: "og:url", content: url }] : []),
    ],
    ...(url ? { links: [{ rel: "canonical", href: url }] } : {}),
  };
}
