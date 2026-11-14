import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

/** Terminal prompts follow the OS locale; native dialogs use Desktop's selected language. */
export function devicePrompt(
  key: keyof typeof en.deviceConnector,
  values: Record<string, string> = {},
) {
  const locale = process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? "en";
  const messages: Record<keyof typeof en.deviceConnector, string> = locale
    .toLowerCase()
    .startsWith("zh")
    ? zh.deviceConnector
    : en.deviceConnector;
  let message: string = messages[key];
  for (const [name, value] of Object.entries(values))
    message = message.replaceAll(`{${name}}`, value);
  return message;
}
