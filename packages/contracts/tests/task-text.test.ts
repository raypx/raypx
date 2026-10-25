import { expect, it } from "vite-plus/test";
import { taskText, normalizeTaskJson } from "../src/tasks.js";
it("keeps code points intact at either end of the protocol UTF-16 budget", () => {
  expect(taskText("x".repeat(31999) + "😀z", 32000)).toBe("x".repeat(31999));
  expect(taskText("x😀" + "z".repeat(31999), 32000, true)).toBe("z".repeat(31999));
  expect(taskText("😀", 1)).toBe("");
  expect(taskText("😀", 2)).toBe("😀");
  expect(taskText("😀", 1, true)).toBe("");
});
it("repairs invalid Unicode and NUL throughout JSON values and object keys", () => {
  expect(normalizeTaskJson({ "\ud83d": ["a\ud83db", "\ude00", "\0", "😀𠮷"], valid: 42 })).toEqual({
    "�": ["a�b", "�", "�", "😀𠮷"],
    valid: 42,
  });
});
