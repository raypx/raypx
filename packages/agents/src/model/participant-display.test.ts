import { expect, it } from "vitest";
import { conversationMemberLabel } from "./participant-display.js";
const participants = [
  { accountId: "member", displayName: "Mei", isMember: true },
  { accountId: "departed", displayName: "Alex", isMember: false },
];
it.each([
  { you: "You", member: "Member", departed: (name: string) => `${name} (no longer in this Space)` },
  { you: "你", member: "成员", departed: (name: string) => `${name}（已离开此空间）` },
])("uses snapshot names and departed attribution in either language", (copy) => {
  expect(conversationMemberLabel("viewer", "viewer", participants, undefined, copy)).toBe(copy.you);
  expect(conversationMemberLabel("member", "viewer", participants, undefined, copy)).toBe("Mei");
  expect(conversationMemberLabel("departed", "viewer", participants, [], copy)).toBe(
    copy.departed("Alex"),
  );
  expect(conversationMemberLabel("unknown", "viewer", participants, [], copy)).toBe(copy.member);
});
