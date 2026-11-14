import { expect, it } from "vitest";
import { validateAttachment } from "./attachments.js";
it("rejects mismatched image signatures, invalid UTF-8, active types and unsafe names", () => {
  expect(() =>
    validateAttachment({ name: "fake.png", mediaType: "image/png", bytes: "YQ==" }),
  ).toThrow("ATTACHMENT_INVALID");
  expect(() =>
    validateAttachment({ name: "bad.txt", mediaType: "text/plain", bytes: "/w==" }),
  ).toThrow("ATTACHMENT_INVALID");
  expect(() =>
    validateAttachment({ name: "../notes", mediaType: "text/plain", bytes: "YQ==" }),
  ).toThrow("ATTACHMENT_INVALID");
  expect(() =>
    validateAttachment({ name: "notes.txt", mediaType: "text/plain", bytes: "YQ=" }),
  ).toThrow("ATTACHMENT_LIMIT");
  expect(() =>
    validateAttachment({ name: "a.json", mediaType: "application/json", bytes: btoa("not json") }),
  ).toThrow("ATTACHMENT_INVALID");
  expect(
    validateAttachment({ name: "notes.txt", mediaType: "text/plain", bytes: "YQ==" }).length,
  ).toBe(1);
});
