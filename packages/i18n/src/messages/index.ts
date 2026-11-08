import en from "./en.ts";
import zh from "./zh.ts";
import type { MessagesByLocale } from "../types.ts";

export const messages = { en, zh } satisfies MessagesByLocale;
