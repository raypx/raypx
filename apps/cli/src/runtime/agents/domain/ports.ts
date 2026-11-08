/**
 * Determinism ports for Agent orchestration. Application and harness code never read
 * the wall clock or generate identities inline; tests inject fakes, production uses
 * the live implementations.
 */

export interface Clock {
  now(): Date;
}

export interface Ids {
  generate(): string;
}

// Read Date.now explicitly so tests that freeze time also freeze the clock.
export const systemClock: Clock = { now: () => new Date(Date.now()) };

export const cryptoIds: Ids = { generate: () => crypto.randomUUID() };

/** Fixed-time clock for characterization tests and replay. */
export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
    return this;
  }

  set(value: Date) {
    this.current = value;
    return this;
  }
}

/** Schema-valid deterministic UUIDs: `00000000-0000-4000-8000-<counter>`. */
export class FakeIds implements Ids {
  private counter = 0;

  generate() {
    return `00000000-0000-4000-8000-${String(this.counter++).padStart(12, "0")}`;
  }
}
