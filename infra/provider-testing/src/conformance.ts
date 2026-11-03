import { expect, it } from "vite-plus/test";
import type { ProviderSession } from "@raypx/provider-core";
import { observeDrain, type createTestProviderHost } from "./index.js";

export interface ProviderHarness {
  session: ProviderSession;
  host: ReturnType<typeof createTestProviderHost>;
  complete(): void;
  started(): boolean;
  drain(): void;
}
/** All adapters pass the same normalized lifetime and replaced-owner scenarios. */
export function defineProviderConformance(name: string, fixture: () => ProviderHarness) {
  it(name + " reports a completed turn through the host boundary", async () => {
    const f = fixture();
    try {
      await f.session.initialize("run");
      await f.session.sendTurn("Synthetic conformance prompt", null, "run");
      f.complete();
      await expect
        .poll(() =>
          f.host.events.some((event) => event.type === "completed" && event.status === "completed"),
        )
        .toBe(true);
    } finally {
      f.drain();
      await f.session.handle.kill();
      await f.session.handle.completed;
    }
  });
  it(name + " fences callbacks after the owner is replaced", async () => {
    const f = fixture();
    try {
      await f.session.initialize("run");
      await f.session.sendTurn("Synthetic conformance prompt", null, "run");
      const count = f.host.events.length;
      f.host.replace();
      f.complete();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(f.host.events).toHaveLength(count);
    } finally {
      f.drain();
      await f.session.handle.kill();
      await f.session.handle.completed;
    }
  });
}

export function defineDrainConformance(name: string, fixture: () => ProviderHarness) {
  it(name + " drains its active transport or SDK before completing the handle", async () => {
    const f = fixture();
    try {
      await f.session.initialize("run");
      await f.session.sendTurn("Synthetic pending request", null, "run");
      await expect.poll(() => f.started()).toBe(true);
      const drained = observeDrain(f.session.handle);
      const closing = f.session.handle.kill();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(drained()).toBe(false);
      f.drain();
      await closing;
      await f.session.handle.completed;
      expect(drained()).toBe(true);
    } finally {
      f.drain();
      await f.session.handle.kill();
    }
  });
}
