/**
 * Milliseconds this process has spent running. A suspended machine or a wall-clock
 * adjustment advances it by at most `maxStep`, so a lease measured against it cannot
 * expire while its holder had no chance to renew.
 *
 * Read it at least every `maxStep`; a longer gap between reads is taken as suspension.
 */
export class AwakeClock {
  private last: number;
  private elapsed = 0;
  constructor(
    private readonly maxStep = 10_000,
    private readonly wall: () => number = Date.now,
  ) {
    this.last = wall();
  }
  now() {
    const current = this.wall();
    this.elapsed += Math.min(Math.max(current - this.last, 0), this.maxStep);
    this.last = current;
    return this.elapsed;
  }
}
