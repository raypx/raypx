const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const STABLE_CONNECTION_MS = 30_000;

/** A successful handshake alone does not end a cycle of short-lived connections. */
export class StreamRetry {
  private delay = FIRST_RETRY_MS;
  private readyAt: number | undefined;

  opening() {
    this.readyAt = undefined;
  }

  ready() {
    this.readyAt = Date.now();
  }

  nextDelay() {
    if (this.readyAt !== undefined && Date.now() - this.readyAt >= STABLE_CONNECTION_MS)
      this.delay = FIRST_RETRY_MS;
    this.readyAt = undefined;

    const delay = this.delay;
    this.delay = Math.min(delay * 2, MAX_RETRY_MS);
    // Keep the first recovery quick; spread repeated attempts across clients.
    return delay === FIRST_RETRY_MS ? delay : Math.round(delay * (0.8 + Math.random() * 0.2));
  }
}
