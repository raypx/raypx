import { expect, it } from "vite-plus/test";
import { approvalChanges } from "../src/client/approval-changes.js";

it("renders Claude replacements with common context and text-safe content", () => {
  const [file] = approvalChanges(
    JSON.stringify({
      file_path: "src/app.ts",
      old_string: "first\nold\nlast",
      new_string: "first\n<script>new</script>\nlast",
    }),
  );
  expect(file?.path).toBe("src/app.ts");
  expect(file?.lines).toEqual([
    { kind: "context", text: "first", old: 1, next: 1 },
    { kind: "remove", text: "old", old: 2 },
    { kind: "add", text: "<script>new</script>", next: 2 },
    { kind: "context", text: "last", old: 3, next: 3 },
  ]);
});
it("reads Codex unified changes and new Claude files without confusing header lines", () => {
  expect(
    approvalChanges(
      JSON.stringify({
        changes: [
          {
            path: "file",
            kind: { type: "update" },
            diff: "--- a/file\n+++ b/file\n@@ -5,1 +5,1 @@\n-before\n+after",
          },
        ],
      }),
    )[0]?.lines,
  ).toEqual([
    { kind: "hunk", text: "@@ -5,1 +5,1 @@" },
    { kind: "remove", text: "before", old: 5 },
    { kind: "add", text: "after", next: 5 },
  ]);
  expect(approvalChanges(JSON.stringify({ file_path: "new", content: "hello" }))[0]?.lines).toEqual(
    [{ kind: "context", text: "hello" }],
  );
  expect(approvalChanges("bun test")).toEqual([]);
});
it("keeps header-like content inside hunks and honors Codex file kinds", () => {
  const [file] = approvalChanges(
    JSON.stringify({
      changes: [
        {
          path: "a",
          kind: { type: "update" },
          diff: "--- a/a\n+++ b/a\n@@ -2,2 +2,2 @@\n--- drop x\n+++ x\n keep",
        },
      ],
    }),
  );
  expect(file?.lines.slice(1)).toEqual([
    { kind: "remove", text: "-- drop x", old: 2 },
    { kind: "add", text: "++ x", next: 2 },
    { kind: "context", text: "keep", old: 3, next: 3 },
  ]);
  for (const type of ["add", "delete"])
    expect(
      approvalChanges(
        JSON.stringify({ changes: [{ path: "a", kind: { type }, diff: "- item\n+++ content" }] }),
      )[0]?.lines.map((line) => line.kind),
    ).toEqual(type === "add" ? ["add", "add"] : ["remove", "remove"]);
  expect(
    approvalChanges(
      JSON.stringify({ changes: [{ path: "a", kind: { type: "unknown" }, diff: "x" }] }),
    ),
  ).toEqual([]);
  expect(
    approvalChanges(
      JSON.stringify({
        changes: [
          { path: "known", kind: { type: "add" }, diff: "hello" },
          { path: "unknown", kind: { type: "future" }, diff: "secret change" },
        ],
      }),
    ),
  ).toEqual([]);
  expect(
    approvalChanges(
      JSON.stringify({
        changes: [
          { path: "a", kind: { type: "update" }, diff: "--- a/a\n+++ b/a\n@@\n--- drop x\n+++ x" },
        ],
      }),
    )[0]?.lines.slice(1),
  ).toEqual([
    { kind: "remove", text: "-- drop x" },
    { kind: "add", text: "++ x" },
  ]);
});
it("bounds large diffs and parses apply_patch file boundaries", () => {
  const files = approvalChanges(
    "*** Begin Patch\n*** Update File: first\n@@\n-old\n+new\n*** Add File: second\n+hello\n*** End Patch",
  );
  expect(files.map((file) => file.path)).toEqual(["first", "second"]);
  expect(files[0]?.lines.some((line) => line.kind === "remove")).toBe(true);
  const large = approvalChanges(
    JSON.stringify({ file_path: "large", content: Array(2000).fill("x").join("\n") }),
  )[0]!;
  expect(large.lines.length).toBeLessThanOrEqual(1200);
  expect(large.truncated).toBe(true);
});
