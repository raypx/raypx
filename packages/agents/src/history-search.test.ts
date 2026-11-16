import { expect, it } from "vitest";
import type { RunExecution } from "./conversations.js";
import { searchOlderHistory } from "./history-search.js";

it("can page through an empty scan and only matches entries in the old prefix", () => {
  const history: RunExecution["history"] = Array.from({ length: 300 }, (_, index) => ({
    role: "user",
    text: index === 0 ? "Harbor was originally BLUE-6" : "An unrelated update",
    createdAt: new Date(index).toISOString(),
  }));
  history.push({
    role: "user",
    text: "Harbor was corrected to OCHRE-2",
    createdAt: new Date().toISOString(),
  });
  const find = (before?: number) => {
    const result = searchOlderHistory(history, 300, {
      id: "lookup",
      arguments: { query: "harbor", before },
    });
    const content = result.content[0];
    if (content?.type !== "text") throw new Error("Expected history text");
    return JSON.parse(content.text);
  };
  const first = find();
  expect(first).toMatchObject({ matches: [], nextBefore: expect.any(Number) });
  expect(find(first.nextBefore)).toMatchObject({
    matches: [{ position: 1, excerpt: "Harbor was originally BLUE-6" }],
    nextBefore: null,
  });
});
