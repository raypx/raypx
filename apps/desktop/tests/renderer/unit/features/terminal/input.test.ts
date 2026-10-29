import { describe, expect, it } from "vite-plus/test";
import { terminalKey } from "../../../../../src/features/terminal/input";
const event = {
  type: "keydown",
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};
describe("Herdr terminal key routing", () => {
  it("delegates application cursor and modified keys to Herdr", () => {
    expect(terminalKey({ ...event, key: "ArrowUp" })).toBe("up");
    expect(terminalKey({ ...event, key: "Tab", shiftKey: true })).toBe("shift+tab");
    expect(terminalKey({ ...event, key: "c", ctrlKey: true })).toBe("ctrl+c");
  });
  it("leaves text, IME, key releases and system shortcuts to xterm and the browser", () => {
    expect(terminalKey({ ...event, key: "A" })).toBeNull();
    expect(terminalKey({ ...event, key: "Process", isComposing: true })).toBeNull();
    expect(terminalKey({ ...event, key: "c", metaKey: true })).toBeNull();
    expect(terminalKey({ ...event, key: "ArrowUp", type: "keyup" })).toBeNull();
  });
});
