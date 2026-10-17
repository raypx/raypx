import type { ComponentProps } from "react";
import { messages } from "./messages/index.js";
import { intlClient } from "./react.js";

type BoundProps = ComponentProps<typeof intlClient.LanguageProvider>;

/** Product catalogs are fixed; platforms supply the preference and system languages. */
export function LanguageProvider(props: Omit<BoundProps, "messages">) {
  return <intlClient.LanguageProvider {...props} messages={messages} />;
}
export { useLanguagePreference } from "./react.js";
