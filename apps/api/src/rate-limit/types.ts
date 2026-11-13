export interface RateRule {
  /** Window length in seconds. Keep it at or below Better Auth's longest window (60s),
   * which prunes older rows from the shared table. */
  window: number;
  max: number;
}
/** Resolves true when the request fits the rule and has been counted. */
export type RateLimiter = (key: string, rule: RateRule) => Promise<boolean>;
