import { expect, it } from "vite-plus/test";
import { isTaskActive, taskCursor } from "../../src/index.js";
it("does not offer cancellation for terminal deliveries", () => {
  expect(isTaskActive({ status: "delivery_failed" })).toBe(false);
  expect(isTaskActive({ status: "waiting" })).toBe(true);
  expect(taskCursor({ id: "id", createdAt: "date" })).toBe("date:id");
});
