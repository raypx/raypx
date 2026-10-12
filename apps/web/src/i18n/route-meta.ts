import type { MessageCatalog } from "@voidmix/i18n/types";

import type { WebNamespaceKey } from "./client";

export type CommonMessageKey = WebNamespaceKey<"common">;

type RouteMatchLike = { loaderData?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMessage(catalog: MessageCatalog, key: string): string | undefined {
  const value = catalog[key];
  return typeof value === "string" ? value : undefined;
}

/** Resolve child-route metadata from the root's already-loaded locale catalog. */
export function localizedRouteHead(
  matches: readonly RouteMatchLike[],
  titleKey: CommonMessageKey,
  descriptionKey: CommonMessageKey,
) {
  const rootData = matches[0]?.loaderData;
  const messages = isRecord(rootData) && isRecord(rootData.messages) ? rootData.messages : null;
  const common = messages && isRecord(messages.common) ? (messages.common as MessageCatalog) : null;
  return {
    meta: [
      { title: (common ? readMessage(common, titleKey) : undefined) ?? "Voidmix" },
      {
        name: "description",
        content: (common ? readMessage(common, descriptionKey) : undefined) ?? "",
      },
    ],
  };
}
