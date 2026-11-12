import { describe, expect, it } from "vitest";
import { terminalFrame } from "./frame.js";
describe("terminal screen frames", () => {
  it("queues a reset before complete frames and preserves incremental Unicode bytes", () => {
    const bytes = new TextEncoder().encode("中文\x1b[1;2H");
    const encoded = btoa(String.fromCharCode(...bytes));
    expect(terminalFrame(encoded, false)).toEqual(bytes);
    expect(terminalFrame(encoded, true)).toEqual(new Uint8Array([0x1b, 0x63, ...bytes]));
  });
});
