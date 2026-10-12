import { describe, expect, it } from "vite-plus/test";
import { taskNotificationEmail } from "./task-notification.js";

describe("task notification", () => {
  it.each([
    ["en", "Your delivery is ready"],
    ["zh", "你的交付已准备好"],
  ] as const)("renders HTML and plain text in %s", async (locale, text) => {
    const email = await taskNotificationEmail(
      {
        email: "member@example.test",
        kind: "review_ready",
        taskId: "task-1",
        taskUrl: "https://voidmix.test/tasks/task-1",
      },
      locale,
    );
    expect(email.text).toContain(text);
    expect(email.html).toContain(text);
    expect(email.html).toContain(`lang="${locale}"`);
    expect(email.text).toContain("https://voidmix.test/tasks/task-1");
  });
  it("rejects executable notification links", async () => {
    await expect(
      taskNotificationEmail({
        email: "member@example.test",
        kind: "waiting_input",
        taskId: "task-1",
        taskUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow(TypeError);
  });
});
