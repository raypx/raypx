import { describe, expect, it } from "vite-plus/test";
import { herdrFrame } from "../../../../src/runtime/process/herdr-frame";

const frame = {
  type: "terminal.frame",
  encoding: "ansi",
  seq: 1,
  full: true,
  width: 80,
  height: 24,
  bytes: Buffer.from("中文\x1b[1;4H").toString("base64"),
};
describe("Herdr frame boundary", () => {
  it("preserves ANSI bytes and accepts a new full baseline after a sequence gap", () => {
    expect(herdrFrame(frame, 0)).toMatchObject({
      data: frame.bytes,
      full: true,
      cols: 80,
      rows: 24,
    });
    expect(herdrFrame({ ...frame, seq: 9 }, 2)?.seq).toBe(9);
    expect(herdrFrame({ ...frame, seq: 10, full: false }, 9)?.full).toBe(false);
    expect(herdrFrame({ type: "terminal.closed", reason: "private detail" }, 10)).toBeNull();
  });
  it.each([
    { ...frame, full: false },
    { ...frame, seq: 0 },
    { ...frame, seq: 1.5 },
    { ...frame, width: 501 },
    { ...frame, height: 0 },
    { ...frame, bytes: "not base64" },
    { ...frame, encoding: "raw" },
    { private: "must not leak" },
  ])("rejects malformed initial frames without private diagnostics", (value) => {
    expect(() => herdrFrame(value, 0)).toThrow("Invalid Herdr response");
  });
  it("rejects duplicate or missing incremental frames", () => {
    expect(() => herdrFrame(frame, 1)).toThrow("Invalid Herdr response");
    expect(() => herdrFrame({ ...frame, seq: 3, full: false }, 1)).toThrow(
      "Invalid Herdr response",
    );
  });
});
