import { expect, it } from "vite-plus/test";
import { approvalChanges } from "../src/client/approval-changes.js";
import { MAX_DIFF_LINES } from "../src/model/diff.js";

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

it("separates multiple unified files without treating later file headers as edits", () => {
  const files = approvalChanges(
    JSON.stringify({
      changes: [
        {
          path: "one.ts",
          kind: { type: "update" },
          diff: "diff --git a/one.ts b/one.ts\n--- a/one.ts\n+++ b/one.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/two.ts b/two.ts\n--- a/two.ts\n+++ b/two.ts\n@@ -4 +4 @@\n-before\n+after",
        },
      ],
    }),
  );
  expect(files.map((file) => file.path)).toEqual(["one.ts", "two.ts"]);
  expect(
    files[1]!.lines
      .filter((line) => line.kind === "add" || line.kind === "remove")
      .map((line) => line.text),
  ).toEqual(["before", "after"]);
});
it("shows Codex move_path as a rename", () => {
  expect(
    approvalChanges(
      JSON.stringify({
        changes: [
          {
            path: "old.ts",
            kind: { type: "update", move_path: "new.ts" },
            diff: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      }),
    )[0],
  ).toMatchObject({ path: "new.ts", previousPath: "old.ts" });
});

it("keeps the whole original request when one file has an invalid unified patch", () => {
  expect(
    approvalChanges(
      JSON.stringify({
        changes: [
          { path: "known", kind: { type: "add" }, diff: "hello" },
          { path: "broken", kind: { type: "update" }, diff: "@@ -1,2 +1,2 @@\n-old\n+new" },
        ],
      }),
    ),
  ).toEqual([]);
});

it("requires both strings for a single Claude Edit, including a deliberate empty replacement", () => {
  for (const new_string of [undefined, null, 42, {}, []])
    expect(
      approvalChanges(JSON.stringify({ file_path: "file", old_string: "important", new_string })),
    ).toEqual([]);
  expect(
    approvalChanges(
      JSON.stringify({ file_path: "file", old_string: "important", new_string: "" }),
    )[0]?.lines,
  ).toEqual([{ kind: "remove", text: "important", old: 1 }]);
});

it("uses one request-wide display budget for each supported provider format", () => {
  const contents = Array(800).fill("line").join("\n");
  const inputs = [
    JSON.stringify({ file_path: "file", old_string: "", new_string: contents + "\n" + contents }),
    JSON.stringify({ file_path: "file", content: contents + "\n" + contents }),
    JSON.stringify({
      file_path: "file",
      edits: [
        { old_string: "", new_string: contents },
        { old_string: "", new_string: contents },
      ],
    }),
    JSON.stringify({
      changes: [
        { path: "added", kind: { type: "add" }, diff: contents },
        { path: "deleted", kind: { type: "delete" }, diff: contents },
      ],
    }),
    JSON.stringify({
      changes: [
        {
          path: "unified",
          kind: { type: "update" },
          diff: `@@ -0,0 +1,800 @@\n${Array(800).fill("+line").join("\n")}`,
        },
        {
          path: "snippet",
          kind: { type: "update" },
          diff: `@@\n${Array(800).fill("+line").join("\n")}`,
        },
      ],
    }),
    `*** Begin Patch\n*** Add File: one\n${Array(800).fill("+line").join("\n")}\n*** Add File: two\n${Array(800).fill("+line").join("\n")}\n*** End Patch`,
  ];
  for (const input of inputs) {
    const files = approvalChanges(input);
    expect(files.reduce((count, file) => count + file.lines.length, 0)).toBe(MAX_DIFF_LINES);
    expect(files.some((file) => file.truncated)).toBe(true);
  }
});

it("keeps omitted filenames visible and validates files beyond the presentation limit", () => {
  const changes = Array.from({ length: 20 }, (_, index) => ({
    path: `file-${index}`,
    kind: { type: "update" },
    diff: `@@\n${Array(1199).fill("+x").join("\n")}`,
  }));
  const body = JSON.stringify({ changes });
  expect(body.length).toBeLessThan(128_000);
  const files = approvalChanges(body);
  expect(files).toHaveLength(20);
  expect(files.reduce((count, file) => count + file.lines.length, 0)).toBe(MAX_DIFF_LINES);
  expect(files.slice(1).every((file) => !file.lines.length && file.truncated)).toBe(true);
  expect(
    approvalChanges(
      JSON.stringify({
        changes: [
          ...changes,
          {
            path: "unsupported",
            kind: { type: "update" },
            diff: "@@ -1 +1 @@\n-old\n+new\nUNKNOWN CHANGES\n-hide\n+hidden",
          },
        ],
      }),
    ),
  ).toEqual([]);
});

it("falls back to the complete raw request for unsupported snippet metadata or trailing content", () => {
  const unknown = [
    "UNKNOWN METADATA\n@@\n-old\n+new",
    `@@\n${Array(1200).fill("+line").join("\n")}\nUNKNOWN TRAILING EDIT`,
  ];
  for (const diff of unknown)
    expect(
      approvalChanges(
        JSON.stringify({
          changes: [
            { path: "known", kind: { type: "add" }, diff: "hello" },
            { path: "unknown", kind: { type: "update" }, diff },
          ],
        }),
      ),
    ).toEqual([]);
});

it("keeps unsupported or incomplete apply_patch envelopes raw beyond the display budget too", () => {
  const prefix = `*** Begin Patch\n*** Add File: known\n${Array(1201).fill("+line").join("\n")}`;
  for (const patch of [
    `${prefix}\nUNKNOWN TRAILING EDIT\n*** End Patch`,
    `${prefix}\n*** Delete File: omitted\n*** End Patch`,
    `${prefix}\n*** Update File: old\n*** Move to: new\n@@\n-old\n+new\n*** End Patch`,
    prefix,
    "*** Begin Patch\n*** Add File: file\n+new\n*** End Patch\nunknown tail",
  ])
    expect(approvalChanges(patch)).toEqual([]);
});
