import { join } from "node:path";

export const project = join(__dirname, "../", "inlang");
export const outdir = join(__dirname, "paraglide");

export const i18nConfig = {
  project,
  outdir,
};
