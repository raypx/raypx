import { expect, it } from "vitest";
import { normalizeTrustedOrigins, resumablePath } from "./auth.js";

it("normalizes explicit origins and ignores invalid or opaque entries without widening trust", () => {
  expect(
    normalizeTrustedOrigins([
      " https://web.example.test/ ",
      "https://web.example.test/path",
      "views://main/",
      "invalid",
      "null",
      "file:///tmp/x",
      "javascript:alert(1)",
      "https://user:password@example.test",
      "http://[::1]:1420/",
    ]),
  ).toEqual(["https://web.example.test", "views://main", "http://[::1]:1420"]);
});

const pages = new Set(["/", "/tasks"]);
it.each([
  "https://outside.test/tasks",
  "//outside.test/tasks",
  "/\\outside.test",
  "/tasks\n",
  "/tasks/../login",
  "/%2f%2foutside.test",
  "/unlisted",
  "/" + "a".repeat(2048),
  null,
])("refuses to resume %s", (value) => {
  expect(resumablePath(value, pages)).toBe("/");
});
it("resumes a listed page with its search and hash", () => {
  expect(resumablePath("/tasks?project=a#editor", pages)).toBe("/tasks?project=a#editor");
});
