import type { Locale } from "@raypx/i18n/types";
import type { SendLinkEmailInput } from "../types.js";
import { linkEmail } from "./link.js";

export const passwordResetEmail = (input: SendLinkEmailInput, locale: Locale = "en") =>
  linkEmail("passwordReset", input, locale);
