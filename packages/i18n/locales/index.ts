import en from "./en/index.js";
import zh from "./zh/index.js";
import type { MessagesByLocale } from "../src/types.js";

export const messages = { en, zh } satisfies MessagesByLocale;
