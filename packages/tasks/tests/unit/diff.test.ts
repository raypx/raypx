import { expect, it } from "vite-plus/test";
import { MAX_DIFF_LINES, unifiedDiff } from "../../src/model/diff.js";

it("preserves header-looking edits, line numbers and missing-newline markers", () => {
  const [file] = unifiedDiff(
    "file",
    "--- a/file\n+++ b/file\n@@ -5,2 +8,2 @@ section\n--- drop x\n+++ x\n keep\n\\ No newline at end of file",
  );
  expect(file?.lines).toEqual([
    { kind: "hunk", text: "@@ -5,2 +8,2 @@ section" },
    { kind: "remove", text: "-- drop x", old: 5 },
    { kind: "add", text: "++ x", next: 8 },
    { kind: "context", text: "keep", old: 6, next: 9 },
    { kind: "hunk", text: "\\ No newline at end of file" },
  ]);
});

it("reads quoted Git rename paths and an independent deleted file", () => {
  const files = unifiedDiff(
    "fallback",
    'diff --git "a/old\\tfile" "b/new\\tfile"\nrename from "old\\tfile"\nrename to "new\\tfile"\n--- "a/old\\tfile"\n+++ "b/new\\tfile"\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/gone b/gone\ndeleted file mode 100644\n--- a/gone\n+++ /dev/null\n@@ -1 +0,0 @@\n-bye',
  );
  expect(files[0]).toMatchObject({ path: "new\tfile", previousPath: "old\tfile" });
  expect(files[1]).toMatchObject({ path: "gone" });
  expect(files[1]?.lines[1]).toEqual({ kind: "remove", text: "bye", old: 1 });
});

it("falls back to raw for inconsistent hunks and unsupported binary changes", () => {
  expect(unifiedDiff("file", "@@ -1,2 +1,2 @@\n-only\n+one")).toEqual([]);
  expect(
    unifiedDiff("file", "diff --git a/file b/file\nBinary files a/file and b/file differ"),
  ).toEqual([]);
  expect(unifiedDiff("file", "x".repeat(128_001))).toEqual([]);
});

it("parses the complete patch before bounding its presentation", () => {
  const source = `@@ -0,0 +1,2000 @@\n${Array(2000).fill("+line").join("\n")}`;
  const [file] = unifiedDiff("large", source);
  expect(file?.lines).toHaveLength(MAX_DIFF_LINES);
  expect(file?.truncated).toBe(true);
  expect(file?.lines.at(-1)).toMatchObject({ kind: "add", next: MAX_DIFF_LINES - 1 });
});

it("rejects source sections that jsdiff skips instead of implying a complete preview", () => {
  const patch = "--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new";
  for (const source of [
    `${patch}\n@@@ -1,1 -1,1 +1,1 @@@\n--hidden old\n++hidden new`,
    `${patch}\nUNKNOWN EDIT SECTION\n-danger\n+hidden`,
    `${patch}\nrename from hidden\nrename to hidden-new`,
    `diff --git a/file b/file\nunknown-metadata hidden\n${patch}`,
    `diff --git a/file b/file\n--- a/file\n+++ b/file\nrename from hidden\nrename to hidden-new\n@@ -1 +1 @@\n-old\n+new`,
    `unrecognized preamble\n${patch}`,
    // Mode changes are not represented by this text-only preview.
    `diff --git a/file b/file\nold mode 100644\nnew mode 100755\n${patch}`,
    "diff --git a/link b/link\nnew file mode 120000\n--- /dev/null\n+++ b/link\n@@ -0,0 +1 @@\n+target",
  ])
    expect(unifiedDiff("file", source)).toEqual([]);
});

it("keeps metadata-looking additions inside the counted hunk", () => {
  const [file] = unifiedDiff(
    "file",
    "@@ -0,0 +1,3 @@\n+diff --git a/hidden b/hidden\n+old mode 100644\n+@@@ not a header",
  );
  expect(file?.lines.slice(1).map((line) => line.text)).toEqual([
    "diff --git a/hidden b/hidden",
    "old mode 100644",
    "@@@ not a header",
  ]);
});
