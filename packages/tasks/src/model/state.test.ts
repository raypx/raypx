import { expect, it } from "vitest";
import { isTaskActive, taskCursor } from "./task.js";
it("does not offer cancellation for terminal deliveries", () => {
  expect(isTaskActive({ status: "delivery_failed" })).toBe(false);
  expect(isTaskActive({ status: "waiting" })).toBe(true);
  expect(taskCursor({ id: "id", createdAt: "date" })).toBe("date:id");
});
