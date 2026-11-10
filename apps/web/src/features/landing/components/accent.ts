/**
 * Homepage-only accent. The palette comes from the original logo and is defined as
 * `--landing-*` custom properties on the landing layout; it decorates artwork, glows and
 * selection marks only. Controls keep the neutral tokens.
 */
export const landingAccentVars =
  "[--landing-sky:#3eaff4] [--landing-blue:#588df6] [--landing-violet:#a95ed6] [--landing-pink:#d85cae]";

export const accentGradient =
  "bg-linear-to-r from-[var(--landing-sky)] via-[var(--landing-violet)] to-[var(--landing-pink)]";

/**
 * Scroll-linked settle where CSS view timelines exist: the element starts slightly lower
 * and smaller and settles as it enters. Opacity never changes, so content is always
 * visible; other browsers and reduced motion render it at rest.
 */
export const scrollSettle =
  "motion-safe:supports-[animation-timeline:view()]:animate-in motion-safe:supports-[animation-timeline:view()]:zoom-in-95 motion-safe:supports-[animation-timeline:view()]:slide-in-from-bottom-4 motion-safe:supports-[animation-timeline:view()]:ease-linear motion-safe:supports-[animation-timeline:view()]:fill-mode-both motion-safe:supports-[animation-timeline:view()]:[animation-timeline:view()] motion-safe:supports-[animation-timeline:view()]:[animation-range:entry_0%_cover_35%]";
