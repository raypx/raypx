import { createTranslator as createUseIntlTranslator } from "use-intl/core";
import type { NamespaceKeys, NestedKeyOf } from "use-intl/core";

import { resolveIntlOptions } from "./formats.js";
import type { DynamicMessages } from "./types.js";

export type Translator<
  M extends DynamicMessages = DynamicMessages,
  N extends NamespaceKeys<M, NestedKeyOf<M>> = never,
> = ReturnType<typeof createUseIntlTranslator<M, N>>;
export type CreateTranslatorOptions<
  M extends DynamicMessages = DynamicMessages,
  N extends NamespaceKeys<M, NestedKeyOf<M>> = never,
> = Omit<Parameters<typeof createUseIntlTranslator<M, N>>[0], "_cache" | "_formatters"> & {
  messages: M;
};

/** Only normalize configuration; the callable and its generic signatures belong to use-intl. */
export function createTranslator<
  const M extends DynamicMessages,
  const N extends NamespaceKeys<M, NestedKeyOf<M>> = never,
>({ messages, ...options }: CreateTranslatorOptions<M, N>): Translator<M, N> {
  return createUseIntlTranslator<M, N>({ ...options, ...resolveIntlOptions(options), messages });
}
