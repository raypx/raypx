import { expect, it } from "vite-plus/test";
import { contextDocumentInputSchema } from "./memory.js";

const project = {
  deviceId: "11111111-1111-4111-8111-111111111111",
  projectId: "abcdefab-cdef-4abc-8def-abcdefabcdef",
};

it("normalizes valid document text and retains its explicit project", () => {
  expect(
    contextDocumentInputSchema.parse({
      kind: "memory",
      name: "  Project rules  ",
      category: " Engineering ",
      content: "  Run meaningful tests  ",
      project,
    }),
  ).toEqual({
    kind: "memory",
    name: "Project rules",
    category: "Engineering",
    content: "Run meaningful tests",
    project,
  });
});

it("rejects unsupported fields and malformed project identifiers", () => {
  const input = {
    kind: "memory",
    name: "Project rules",
    category: "Engineering",
    content: "Run meaningful tests",
    project,
  };
  expect(contextDocumentInputSchema.safeParse({ ...input, owner: "other" }).success).toBe(false);
  expect(
    contextDocumentInputSchema.safeParse({
      ...input,
      project: { ...project, projectId: project.projectId.toUpperCase() },
    }).success,
  ).toBe(false);
});
