import { fireEvent, render, screen } from "@testing-library/react";
import { it, expect } from "vite-plus/test";
import { ConversationFeed } from "./index";
const labels = {
  title: "Conversation",
  user: "You",
  assistant: "Agent",
  latest: "Jump to latest",
  empty: "Empty",
};
it("preserves manual scrolling during streaming and restores following on request", () => {
  const user = { id: "input", role: "user" as const, text: "Question" };
  const assistant = { id: "answer", role: "assistant" as const, text: "Partial", streaming: true };
  const { rerender } = render(<ConversationFeed messages={[user, assistant]} labels={labels} />);
  const log = screen.getByRole("log");
  Object.defineProperties(log, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 300 },
  });
  log.scrollTop = 100;
  fireEvent.scroll(log);
  rerender(
    <ConversationFeed messages={[user, { ...assistant, text: "Longer answer" }]} labels={labels} />,
  );
  expect(log.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
  expect(log.scrollTop).toBe(1000);
  Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1200 });
  rerender(
    <ConversationFeed
      messages={[user, { ...assistant, text: "Complete answer" }]}
      labels={labels}
    />,
  );
  expect(log.scrollTop).toBe(1200);
});
