/**
 * Public-page accent. The palette comes from the original logo and is defined as
 * `--brand-*` custom properties on the landing and authentication layouts; it decorates
 * artwork, glows and selection marks only. Controls and readable text keep the neutral
 * tokens, and the workbench never uses it.
 */
export const brandAccentVars =
  "[--brand-sky:#3eaff4] [--brand-blue:#588df6] [--brand-violet:#a95ed6] [--brand-pink:#d85cae]";

export const accentGradient =
  "bg-linear-to-r from-[var(--brand-sky)] via-[var(--brand-violet)] to-[var(--brand-pink)]";
