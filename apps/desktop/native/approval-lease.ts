/** Only an available, visible foreground product surface keeps local approvals reachable. */
export class ApprovalLease {
  private active = false;
  private stopped = false;
  private queue = Promise.resolve();
  constructor(private readonly request: (active: boolean) => Promise<unknown>) {}
  update(ready: boolean, visible: boolean, minimized: boolean) {
    const active = !this.stopped && ready && visible && !minimized;
    if (!active && !this.active) return this.queue;
    this.active = active;
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.request(active))
      .then(() => {});
    return this.queue;
  }
  stop() {
    this.stopped = true;
    return this.update(false, false, false);
  }
}
