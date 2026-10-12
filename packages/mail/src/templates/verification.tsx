import type { Locale } from "@voidmix/i18n/types";
import type { SendLinkEmailInput } from "../types.js";
import { linkEmail } from "./link.js";

export const verificationEmail = (input: SendLinkEmailInput, locale: Locale = "en") =>
  linkEmail("verification", input, locale);
